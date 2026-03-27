/**
 * ETL 변환 레이어: 정규화된 데이터 → DB 삽입 형식
 * DB 스키마(src/db/schema.ts)의 실제 Drizzle 타입 사용
 */

import type {
  NewUniversity,
  NewDepartment,
  NewAdmissionType,
  NewCompetitionRate,
} from '@/db/schema';
import { NormalizedRate } from './normalizer';

// ──────────────────────────────────────────────
// 계열 매핑: ETL 10개 → DB 7개
// ──────────────────────────────────────────────

/** DB schema category: 인문 | 사회 | 자연 | 공학 | 의약 | 예체능 | 교육 */
type DbCategory = '인문' | '사회' | '자연' | '공학' | '의약' | '예체능' | '교육';

const ETL_TO_DB_CATEGORY: Record<string, DbCategory> = {
  'IT계열': '공학',
  '전기전자계열': '공학',
  '기계계열': '공학',
  '건설계열': '공학',
  '의학계열': '의약',
  '의약계열': '의약',
  '자연과학계열': '자연',
  '자연계열': '자연',
  '인문계열': '인문',
  '사회계열': '사회',
  '법학계열': '사회',
  '상경계열': '사회',
  '교육계열': '교육',
  '예체능계열': '예체능',
  '기타': '자연', // 분류 불가 → 자연으로 fallback
};

export function mapToDbCategory(etlCategory: string): DbCategory {
  return ETL_TO_DB_CATEGORY[etlCategory] ?? '자연';
}

// ──────────────────────────────────────────────
// 전형 유형 정규화: ETL → DB
// ──────────────────────────────────────────────

/**
 * ETL의 다양한 전형 표기를 DB admission_types에 맞게 변환
 * 시드 데이터: 수시, 정시 / 크롤링으로 추가: 편입학 등
 */
const ETL_TO_DB_ADMISSION_TYPE: Record<string, string> = {
  '수시': '수시',
  '정시': '정시',
  '편입학': '편입학',
  '재외국민특별전형': '재외국민',
  '특별전형': '특별전형',
};

export function mapToDbAdmissionType(etlType: string): string {
  return ETL_TO_DB_ADMISSION_TYPE[etlType] ?? etlType;
}

// ──────────────────────────────────────────────
// 집계 및 변환
// ──────────────────────────────────────────────

export interface TransformResult {
  universities: Map<string, NewUniversity>;      // key: 대학명
  departments: Map<string, Omit<NewDepartment, 'universityId'>>; // key: "대학명::학과명"
  admissionTypes: Set<string>;                   // DB에 upsert할 전형 유형 집합
  rates: NormalizedRate[];                       // ID 매핑 후 삽입용 원본 유지
}

/**
 * NormalizedRate[] → TransformResult
 * DB upsert 준비: 중복 제거 및 관계 집계
 */
export function transformToDbInserts(data: NormalizedRate[]): TransformResult {
  const universities = new Map<string, NewUniversity>();
  const departments = new Map<string, Omit<NewDepartment, 'universityId'>>();
  const admissionTypes = new Set<string>();

  for (const rate of data) {
    // 대학 중복 제거
    if (!universities.has(rate.universityName)) {
      universities.set(rate.universityName, {
        name: rate.universityName,
        region: rate.region,
        type: rate.universityType,
      });
    }

    // 학과 중복 제거 (대학+학과 조합 기준)
    const deptKey = `${rate.universityName}::${rate.departmentName}`;
    if (!departments.has(deptKey)) {
      departments.set(deptKey, {
        name: rate.departmentName,
        category: mapToDbCategory(rate.departmentCategory),
      });
    }

    // 전형 유형 수집 (DB upsert 대상)
    admissionTypes.add(mapToDbAdmissionType(rate.admissionType));
  }

  return { universities, departments, admissionTypes, rates: data };
}

/**
 * ID 매핑 완료 후 competition_rates 삽입 데이터 생성
 *
 * @param data 정규화된 경쟁률 데이터
 * @param departmentIdMap "대학명::학과명" → DB departments.id
 * @param admissionTypeIdMap DB 전형유형명 → DB admission_types.id
 */
export function buildRateInserts(
  data: NormalizedRate[],
  departmentIdMap: Map<string, number>,
  admissionTypeIdMap: Map<string, number>
): NewCompetitionRate[] {
  const inserts: NewCompetitionRate[] = [];
  const skipped: string[] = [];

  for (const rate of data) {
    const deptKey = `${rate.universityName}::${rate.departmentName}`;
    const departmentId = departmentIdMap.get(deptKey);
    const dbAdmissionType = mapToDbAdmissionType(rate.admissionType);
    const admissionTypeId = admissionTypeIdMap.get(dbAdmissionType);

    if (!departmentId) {
      skipped.push(`학과 ID 없음: ${deptKey}`);
      continue;
    }
    if (!admissionTypeId) {
      skipped.push(`전형유형 ID 없음: ${dbAdmissionType}`);
      continue;
    }

    inserts.push({
      departmentId,
      admissionTypeId,
      year: rate.year,
      applicants: rate.applicants,
      accepted: rate.accepted,
      rate: rate.rate,
    });
  }

  if (skipped.length > 0) {
    console.warn(`[transformer] ${skipped.length}건 스킵:`, skipped.slice(0, 5));
  }

  console.log(`[transformer] ${inserts.length}건 삽입 준비 완료`);
  return inserts;
}

// ──────────────────────────────────────────────
// 통계
// ──────────────────────────────────────────────

export interface EtlStats {
  totalRecords: number;
  uniqueUniversities: number;
  uniqueDepartments: number;
  admissionTypes: string[];
  yearRange: { min: number; max: number } | null;
}

export function calcEtlStats(data: NormalizedRate[]): EtlStats {
  if (data.length === 0) {
    return {
      totalRecords: 0,
      uniqueUniversities: 0,
      uniqueDepartments: 0,
      admissionTypes: [],
      yearRange: null,
    };
  }

  const universities = new Set(data.map((d) => d.universityName));
  const depts = new Set(data.map((d) => `${d.universityName}::${d.departmentName}`));
  const admissionTypes = [...new Set(data.map((d) => mapToDbAdmissionType(d.admissionType)))];
  const years = data.map((d) => d.year);

  return {
    totalRecords: data.length,
    uniqueUniversities: universities.size,
    uniqueDepartments: depts.size,
    admissionTypes,
    yearRange: { min: Math.min(...years), max: Math.max(...years) },
  };
}
