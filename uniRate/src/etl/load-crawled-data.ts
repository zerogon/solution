/**
 * 크롤링된 실용음악 데이터를 DB에 적재
 * data/crawled-music-rates.json → DB
 *
 * 실행: pnpm etl:load:music
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadRates, RateRecord } from './loader';
import { inferUniversityType } from './normalizer';

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
  universityType?: string;
}

async function main() {
  console.log('=== 크롤링 데이터 DB 적재 ===\n');

  // JSON 파일 로드
  const dataPath = join(process.cwd(), 'data', 'crawled-music-rates.json');
  const rawData: CrawledRate[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
  console.log(`파일 로드: ${rawData.length}건`);

  // 동일 연도 내 중복 제거 (대학+학과+전형+연도 기준)
  const uniqueMap = new Map<string, CrawledRate>();
  for (const item of rawData) {
    const key = `${item.universityName}::${item.departmentName}::${item.admissionType}::${item.year}`;
    const existing = uniqueMap.get(key);
    if (!existing || item.rate > existing.rate) {
      uniqueMap.set(key, item);
    }
  }

  const deduped = Array.from(uniqueMap.values());
  console.log(`중복 제거 후: ${deduped.length}건`);

  // 경쟁률 0인 항목 제외 (미운영 학과)
  const valid = deduped.filter((d) => d.rate > 0);
  console.log(`유효 데이터 (경쟁률 > 0): ${valid.length}건\n`);

  // RateRecord 형식으로 변환 (학년도 그대로 저장)
  const records: RateRecord[] = valid.map((d) => ({
    universityName: d.universityName,
    departmentName: d.departmentName,
    region: d.region,
    universityType: d.universityType ?? inferUniversityType(d.universityName),
    departmentCategory: '예체능',
    year: d.year,
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
