/**
 * ETL 모듈 진입점
 * 외부에서 사용할 주요 함수 및 타입 re-export
 */

export { scrapeAdmissionRates, scrapeUniversityRates } from './scraper';
export type { ScrapingOptions, ScrapingResult, ScrapingError } from './scraper';

export { parseAdmissionTable, normalizeAdmissionType, validateParsedRate } from './parser';
export type { ParsedRate } from './parser';

export {
  normalizeRate,
  normalizeRates,
  normalizeUniversityName,
  normalizeDepartmentName,
  normalizeRegion,
  normalizeUniversityType,
  classifyDepartmentCategory,
} from './normalizer';
export type { NormalizedRate } from './normalizer';

export {
  transformToDbInserts,
  buildRateInserts,
  calcEtlStats,
  mapToDbCategory,
  mapToDbAdmissionType,
} from './transformer';
export type { TransformResult, EtlStats } from './transformer';

export {
  runEtlPipeline,
  scheduler,
  initScheduler,
} from './scheduler';
export type { ScheduleConfig, RunMeta, AdmissionTypeFilter } from './scheduler';
