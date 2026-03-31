/**
 * ETL 자동 수집 스케줄러
 * 연간 2회(3월 수시 결과, 9월 정시 결과) cron 기반 실행
 */

import { scrapeAdmissionRates, ScrapingResult } from './scraper';
import { normalizeRates, NormalizedRate } from './normalizer';

// cron 표현식 상수 (node-cron 형식)
// 매년 3월 1일 오전 2시: 수시 최종 경쟁률 발표 이후
const CRON_SUSI = '0 2 1 3 *';
// 매년 9월 1일 오전 2시: 정시 지원 결과 발표 이후
const CRON_JEONGSI = '0 2 1 9 *';

export type AdmissionTypeFilter = '수시' | '정시' | '편입학' | 'all';

export interface ScheduleConfig {
  enabled: boolean;
  admissionType: AdmissionTypeFilter;
  targetYears?: number[];      // 미지정 시 현재 연도
  onSuccess?: (data: NormalizedRate[], meta: RunMeta) => Promise<void>;
  onError?: (error: Error, meta: RunMeta) => Promise<void>;
}

export interface RunMeta {
  runId: string;
  startedAt: Date;
  finishedAt?: Date;
  admissionType: AdmissionTypeFilter;
  year: number;
  totalRecords: number;
  status: 'running' | 'success' | 'failed';
  errorMessage?: string;
}

/** 실행 이력 저장소 (메모리 기반, 실서비스에서는 DB로 교체) */
const runHistory: RunMeta[] = [];

/** 고유 실행 ID 생성 */
function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 단일 ETL 실행 (크롤링 → 정규화)
 */
export async function runEtlPipeline(
  year: number,
  admissionType: AdmissionTypeFilter,
  callbacks?: Pick<ScheduleConfig, 'onSuccess' | 'onError'>
): Promise<RunMeta> {
  const runId = generateRunId();
  const meta: RunMeta = {
    runId,
    startedAt: new Date(),
    admissionType,
    year,
    totalRecords: 0,
    status: 'running',
  };
  runHistory.push(meta);

  console.log(`[scheduler] ETL 시작 runId=${runId} year=${year} type=${admissionType}`);

  try {
    const typeFilter = admissionType === 'all' ? undefined : admissionType;
    const result: ScrapingResult = await scrapeAdmissionRates({
      year,
      admissionType: typeFilter,
    });

    if (!result.success) {
      const errSummary = result.errors.map((e) => e.message).join('; ');
      console.warn(`[scheduler] 일부 페이지 수집 실패: ${errSummary}`);
    }

    const normalized = normalizeRates(result.data);
    meta.totalRecords = normalized.length;
    meta.finishedAt = new Date();
    meta.status = 'success';

    console.log(
      `[scheduler] ETL 완료 runId=${runId} records=${normalized.length} ` +
        `duration=${meta.finishedAt.getTime() - meta.startedAt.getTime()}ms`
    );

    await callbacks?.onSuccess?.(normalized, meta);
    return meta;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    meta.finishedAt = new Date();
    meta.status = 'failed';
    meta.errorMessage = error.message;

    console.error(`[scheduler] ETL 실패 runId=${runId}: ${error.message}`);
    await callbacks?.onError?.(error, meta);
    return meta;
  }
}

/**
 * cron 표현식을 사람이 읽기 쉬운 형태로 변환
 */
function describeCron(expr: string): string {
  if (expr === CRON_SUSI) return '매년 3월 1일 오전 2시 (수시 결과)';
  if (expr === CRON_JEONGSI) return '매년 9월 1일 오전 2시 (정시 결과)';
  return expr;
}

/**
 * 스케줄러 클래스
 * node-cron 의존성 없이 순수 타입으로 스케줄 관리
 * 실서비스에서는 node-cron 또는 별도 job 런너와 연동
 */
export class EtlScheduler {
  private jobs: Map<string, { cronExpr: string; config: ScheduleConfig }> = new Map();

  /** 수시/정시 기본 스케줄 등록 */
  registerDefaultSchedules(config: Omit<ScheduleConfig, 'admissionType'>): void {
    this.jobs.set('susi', {
      cronExpr: CRON_SUSI,
      config: { ...config, admissionType: '수시' },
    });
    this.jobs.set('jeongsi', {
      cronExpr: CRON_JEONGSI,
      config: { ...config, admissionType: '정시' },
    });

    console.log('[scheduler] 기본 스케줄 등록 완료');
    this.listJobs();
  }

  /** 커스텀 스케줄 등록 */
  registerJob(jobId: string, cronExpr: string, config: ScheduleConfig): void {
    this.jobs.set(jobId, { cronExpr, config });
    console.log(`[scheduler] 스케줄 등록: jobId=${jobId} cron="${cronExpr}"`);
  }

  /** 특정 job 즉시 실행 (수동 트리거) */
  async triggerJob(jobId: string, year?: number): Promise<RunMeta | null> {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`[scheduler] 존재하지 않는 job: ${jobId}`);
      return null;
    }

    const { config } = job;
    if (!config.enabled) {
      console.warn(`[scheduler] 비활성화된 job: ${jobId}`);
      return null;
    }

    const targetYear = year ?? new Date().getFullYear();
    return runEtlPipeline(targetYear, config.admissionType, {
      onSuccess: config.onSuccess,
      onError: config.onError,
    });
  }

  /** 과거 연도 데이터 일괄 수집 (백필) */
  async backfill(startYear: number, endYear: number, admissionType: AdmissionTypeFilter = 'all'): Promise<RunMeta[]> {
    const results: RunMeta[] = [];
    console.log(`[scheduler] 백필 시작: ${startYear}~${endYear}년 ${admissionType}`);

    for (let year = startYear; year <= endYear; year++) {
      const meta = await runEtlPipeline(year, admissionType);
      results.push(meta);

      // 연도 간 2초 대기
      if (year < endYear) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(`[scheduler] 백필 완료: ${results.length}건 실행`);
    return results;
  }

  /** 등록된 스케줄 목록 출력 */
  listJobs(): void {
    console.log('[scheduler] 등록된 스케줄:');
    for (const [jobId, { cronExpr, config }] of this.jobs.entries()) {
      console.log(
        `  - ${jobId}: ${describeCron(cronExpr)} | ` +
          `유형=${config.admissionType} | ` +
          `활성=${config.enabled}`
      );
    }
  }

  /** 실행 이력 조회 */
  getRunHistory(limit = 50): RunMeta[] {
    return runHistory.slice(-limit);
  }

  /** 최근 실행 결과 조회 */
  getLastRun(jobType?: AdmissionTypeFilter): RunMeta | undefined {
    const history = jobType
      ? runHistory.filter((r) => r.admissionType === jobType)
      : runHistory;
    return history[history.length - 1];
  }

  /** 실패한 실행 목록 */
  getFailedRuns(): RunMeta[] {
    return runHistory.filter((r) => r.status === 'failed');
  }
}

/** 싱글턴 스케줄러 인스턴스 */
export const scheduler = new EtlScheduler();

/**
 * 스케줄러 초기화 (애플리케이션 시작 시 호출)
 * DB 저장 콜백은 db-architect의 스키마 확정 후 연동
 */
export function initScheduler(
  onSuccess: (data: NormalizedRate[], meta: RunMeta) => Promise<void>,
  onError: (error: Error, meta: RunMeta) => Promise<void>
): void {
  scheduler.registerDefaultSchedules({
    enabled: true,
    onSuccess,
    onError,
  });

  console.log('[scheduler] 스케줄러 초기화 완료');
  console.log('[scheduler] 실제 cron 실행을 위해 node-cron 또는 별도 job 런너와 연동 필요');
  console.log(`[scheduler] 수시 스케줄: ${describeCron(CRON_SUSI)}`);
  console.log(`[scheduler] 정시 스케줄: ${describeCron(CRON_JEONGSI)}`);
}
