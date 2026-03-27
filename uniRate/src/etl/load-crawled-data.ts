/**
 * 크롤링된 실용음악 데이터를 DB에 적재
 * data/crawled-music-rates.json → DB
 *
 * 실행: pnpm etl:load:music
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadRates, RateRecord } from './loader';

interface CrawledRate {
  universityName: string;
  departmentName: string;
  campus: string;
  region: string;
  year: number;
  admissionType: string;
  applicants: number;
  accepted: number;
  rate: number;
}

async function main() {
  console.log('=== 크롤링 데이터 DB 적재 ===\n');

  // JSON 파일 로드
  const dataPath = join(process.cwd(), 'data', 'crawled-music-rates.json');
  const rawData: CrawledRate[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
  console.log(`파일 로드: ${rawData.length}건`);

  // 대학어디가의 연도 데이터 중복 문제 해결:
  // 2027/2026 데이터가 동일하므로, 가장 최신 연도만 사용하되
  // DB에는 실제 반영 연도(2025)로 저장
  // (2027학년도 모집 = 2025년 기준 경쟁률 데이터)

  // 연도별 중복 제거: 동일 대학+학과+전형이면 최신 연도 데이터만 유지
  const uniqueMap = new Map<string, CrawledRate>();
  for (const item of rawData) {
    const key = `${item.universityName}::${item.departmentName}::${item.admissionType}`;
    const existing = uniqueMap.get(key);
    if (!existing || item.year > existing.year) {
      uniqueMap.set(key, item);
    }
  }

  const deduped = Array.from(uniqueMap.values());
  console.log(`중복 제거 후: ${deduped.length}건`);

  // 경쟁률 0인 항목 제외 (미운영 학과)
  const valid = deduped.filter((d) => d.rate > 0);
  console.log(`유효 데이터 (경쟁률 > 0): ${valid.length}건\n`);

  // RateRecord 형식으로 변환
  // 연도는 2025로 통일 (최신 공개 데이터 기준)
  const records: RateRecord[] = valid.map((d) => ({
    universityName: d.universityName,
    departmentName: d.departmentName,
    region: d.region,
    universityType: '사립', // 서울 실용음악 대학은 모두 사립
    departmentCategory: '예체능',
    year: 2025, // 실제 데이터 반영 연도
    admissionType: d.admissionType,
    applicants: d.applicants,
    accepted: d.accepted > 0 ? d.accepted : 1,
    rate: d.rate,
  }));

  // DB 적재
  console.log('DB 적재 시작...');
  const result = await loadRates(records);

  // 결과 출력
  console.log('\n=== 적재 결과 ===');
  console.log(`  총 레코드: ${result.totalRecords}건`);
  console.log(`  신규 삽입: ${result.inserted}건`);
  console.log(`  중복 스킵: ${result.skipped}건`);
  console.log(`  신규 대학: ${result.universities}개`);
  console.log(`  신규 학과: ${result.departments}개`);

  if (result.errors.length > 0) {
    console.log(`  에러: ${result.errors.length}건`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  console.log('\n적재 완료');
}

main().catch((err) => {
  console.error('적재 실패:', err);
  process.exit(1);
});
