/**
 * 대학알리미(academyinfo.go.kr) Playwright 기반 크롤러
 * 실제 사이트 접속 없이 구조를 모델링한 크롤러 구현체
 */

import { chromium, Browser, Page } from 'playwright';
import { parseAdmissionTable, ParsedRate } from './parser';

// 크롤링 대상 URL 상수
const BASE_URL = 'https://www.academyinfo.go.kr';
const ADMISSION_RATE_PATH = '/pubinfo/pubinfo04020002.do';

// 재시도 설정
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1초
const MAX_DELAY_MS = 10000; // 10초

// Rate limiting: 요청 간 1~3초 대기
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 3000;

export interface ScrapingOptions {
  year?: number;          // 수집 연도 (기본: 현재 연도)
  universityName?: string; // 특정 대학 필터
  admissionType?: string;  // 입시 유형 (수시/정시/편입 등)
  headless?: boolean;      // 헤드리스 모드 (기본: true)
}

export interface ScrapingResult {
  success: boolean;
  data: ParsedRate[];
  errors: ScrapingError[];
  meta: {
    totalPages: number;
    processedPages: number;
    duration: number; // ms
  };
}

export interface ScrapingError {
  page?: number;
  university?: string;
  message: string;
  timestamp: Date;
}

/** 지연 함수 (exponential backoff 지원) */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 재시도 대기 시간 계산 (exponential backoff) */
function calcBackoffDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(exponential, MAX_DELAY_MS);
}

/** Rate limit을 위한 랜덤 대기 */
function randomInterval(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

/**
 * 페이지 로드 재시도 래퍼
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const waitMs = calcBackoffDelay(attempt);
        console.warn(
          `[scraper] ${context} 재시도 ${attempt + 1}/${maxRetries}, ${waitMs}ms 대기: ${lastError.message}`
        );
        await delay(waitMs);
      }
    }
  }

  throw new Error(`[scraper] ${context} 최대 재시도 횟수 초과: ${lastError?.message}`);
}

/**
 * 대학알리미 경쟁률 페이지 네비게이션
 * 실제 사이트의 쿼리 파라미터 구조를 반영
 */
async function navigateToRatePage(
  page: Page,
  year: number,
  pageNum: number,
  admissionType?: string
): Promise<void> {
  const params = new URLSearchParams({
    year: String(year),
    pageIndex: String(pageNum),
    ...(admissionType && { selAdmissionType: admissionType }),
  });

  const url = `${BASE_URL}${ADMISSION_RATE_PATH}?${params.toString()}`;
  console.log(`[scraper] 페이지 이동: ${url}`);

  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // 테이블이 렌더링될 때까지 대기
  await page.waitForSelector('table.tbl_type', { timeout: 10000 }).catch(() => {
    console.warn('[scraper] 경쟁률 테이블을 찾을 수 없음, 빈 페이지일 수 있음');
  });
}

/**
 * 전체 페이지 수 파싱
 */
async function getTotalPages(page: Page): Promise<number> {
  try {
    // 대학알리미 페이지네이션 구조: .paging 내 마지막 숫자 링크
    const totalText = await page.$eval(
      '.paging a:last-child',
      (el) => el.textContent?.trim() ?? '1'
    );
    return parseInt(totalText, 10) || 1;
  } catch {
    return 1;
  }
}

/**
 * 단일 페이지 크롤링
 */
async function scrapePage(
  page: Page,
  year: number,
  pageNum: number,
  admissionType?: string
): Promise<ParsedRate[]> {
  await withRetry(
    () => navigateToRatePage(page, year, pageNum, admissionType),
    `페이지 ${pageNum} 로드`
  );

  // HTML 추출
  const html = await page.content();
  return parseAdmissionTable(html, year);
}

/**
 * 메인 크롤러 진입점
 */
export async function scrapeAdmissionRates(
  options: ScrapingOptions = {}
): Promise<ScrapingResult> {
  const {
    year = new Date().getFullYear(),
    admissionType,
    headless = true,
  } = options;

  const startTime = Date.now();
  const allData: ParsedRate[] = [];
  const errors: ScrapingError[] = [];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    // 첫 페이지 로드로 전체 페이지 수 파악
    console.log(`[scraper] ${year}년 경쟁률 수집 시작`);
    await withRetry(
      () => navigateToRatePage(page, year, 1, admissionType),
      '첫 페이지 로드'
    );

    const totalPages = await getTotalPages(page);
    console.log(`[scraper] 총 ${totalPages} 페이지 수집 예정`);

    // 첫 페이지 데이터 파싱
    const firstPageHtml = await page.content();
    const firstPageData = parseAdmissionTable(firstPageHtml, year);
    allData.push(...firstPageData);

    // 나머지 페이지 순차 처리 (rate limiting 적용)
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      try {
        // Rate limiting 대기
        const waitMs = randomInterval();
        await delay(waitMs);

        const pageData = await scrapePage(page, year, pageNum, admissionType);
        allData.push(...pageData);

        console.log(
          `[scraper] 페이지 ${pageNum}/${totalPages} 완료 (누적: ${allData.length}건)`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scraper] 페이지 ${pageNum} 실패: ${message}`);
        errors.push({ page: pageNum, message, timestamp: new Date() });
      }
    }

    return {
      success: errors.length === 0,
      data: allData,
      errors,
      meta: {
        totalPages,
        processedPages: totalPages - errors.length,
        duration: Date.now() - startTime,
      },
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 특정 대학의 경쟁률만 수집
 */
export async function scrapeUniversityRates(
  universityName: string,
  years: number[]
): Promise<ScrapingResult> {
  const allData: ParsedRate[] = [];
  const allErrors: ScrapingError[] = [];
  const startTime = Date.now();

  for (const year of years) {
    console.log(`[scraper] ${universityName} ${year}년 수집`);
    const result = await scrapeAdmissionRates({ year });

    // 해당 대학 데이터만 필터링
    const filtered = result.data.filter(
      (d) => d.universityName.includes(universityName)
    );
    allData.push(...filtered);
    allErrors.push(...result.errors);

    if (years.indexOf(year) < years.length - 1) {
      await delay(randomInterval());
    }
  }

  const totalPages = years.length;
  return {
    success: allErrors.length === 0,
    data: allData,
    errors: allErrors,
    meta: {
      totalPages,
      processedPages: totalPages - allErrors.length,
      duration: Date.now() - startTime,
    },
  };
}
