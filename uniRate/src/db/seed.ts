import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'path';
import { universities, departments, admissionTypes, competitionRates } from './schema';

const MIGRATIONS_PATH = path.join(process.cwd(), 'src', 'db', 'migrations');

async function seed() {
  // DB 연결
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client);

  // 마이그레이션 실행
  console.log('마이그레이션 실행 중...');
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });
  console.log('마이그레이션 완료');

  // 기존 데이터 초기화
  await db.delete(competitionRates);
  await db.delete(departments);
  await db.delete(admissionTypes);
  await db.delete(universities);

  // ─── 대학교 삽입 ───────────────────────────────────────────────
  const univData = [
    { name: '서울대학교', region: '서울', type: '국립' },
    { name: '연세대학교', region: '서울', type: '사립' },
    { name: '고려대학교', region: '서울', type: '사립' },
    { name: '한국과학기술원', region: '대전', type: '국립' },
    { name: '성균관대학교', region: '서울', type: '사립' },
  ];

  const insertedUnivs = await db.insert(universities).values(univData).returning();
  console.log(`대학교 ${insertedUnivs.length}개 삽입 완료`);

  const univMap: Record<string, number> = {};
  for (const u of insertedUnivs) {
    univMap[u.name] = u.id;
  }

  // ─── 입시 유형 삽입 ────────────────────────────────────────────
  const typeData = [
    { name: '수시' },
    { name: '정시' },
  ];

  const insertedTypes = await db.insert(admissionTypes).values(typeData).returning();
  console.log(`입시유형 ${insertedTypes.length}개 삽입 완료`);

  const suSi = insertedTypes.find((t) => t.name === '수시')!.id;
  const jeongSi = insertedTypes.find((t) => t.name === '정시')!.id;

  // ─── 학과 삽입 ─────────────────────────────────────────────────
  const deptData = [
    // 서울대학교
    { universityId: univMap['서울대학교'], name: '컴퓨터공학부', category: '공학' },
    { universityId: univMap['서울대학교'], name: '경영학과', category: '사회' },
    { universityId: univMap['서울대학교'], name: '의학과', category: '의약' },
    // 연세대학교
    { universityId: univMap['연세대학교'], name: '컴퓨터과학과', category: '공학' },
    { universityId: univMap['연세대학교'], name: '경제학과', category: '사회' },
    { universityId: univMap['연세대학교'], name: '의예과', category: '의약' },
    // 고려대학교
    { universityId: univMap['고려대학교'], name: '사이버국방학과', category: '공학' },
    { universityId: univMap['고려대학교'], name: '법학과', category: '사회' },
    { universityId: univMap['고려대학교'], name: '의학과', category: '의약' },
    // 한국과학기술원
    { universityId: univMap['한국과학기술원'], name: '전산학부', category: '공학' },
    { universityId: univMap['한국과학기술원'], name: '수리과학과', category: '자연' },
    { universityId: univMap['한국과학기술원'], name: '물리학과', category: '자연' },
    // 성균관대학교
    { universityId: univMap['성균관대학교'], name: '소프트웨어학과', category: '공학' },
    { universityId: univMap['성균관대학교'], name: '글로벌경영학과', category: '사회' },
    { universityId: univMap['성균관대학교'], name: '의예과', category: '의약' },
  ];

  const insertedDepts = await db.insert(departments).values(deptData).returning();
  console.log(`학과 ${insertedDepts.length}개 삽입 완료`);

  // ─── 경쟁률 데이터 생성 (2022~2024) ───────────────────────────
  // 학과별 경쟁률 샘플 (수시/정시 각각 다르게)
  const rateConfig: Record<string, { suSi: number[]; jeongSi: number[] }> = {
    '서울대학교_컴퓨터공학부':   { suSi: [14.2, 13.8, 15.1], jeongSi: [5.3, 4.9, 5.7] },
    '서울대학교_경영학과':       { suSi: [18.5, 17.9, 19.2], jeongSi: [6.8, 6.4, 7.1] },
    '서울대학교_의학과':         { suSi: [25.6, 24.3, 26.8], jeongSi: [9.4, 8.9, 10.2] },
    '연세대학교_컴퓨터과학과':   { suSi: [12.1, 11.6, 13.4], jeongSi: [4.8, 4.5, 5.2] },
    '연세대학교_경제학과':       { suSi: [16.3, 15.7, 17.1], jeongSi: [5.9, 5.6, 6.3] },
    '연세대학교_의예과':         { suSi: [22.8, 21.5, 23.9], jeongSi: [8.7, 8.3, 9.1] },
    '고려대학교_사이버국방학과': { suSi: [20.4, 19.8, 21.6], jeongSi: [7.2, 6.9, 7.8] },
    '고려대학교_법학과':         { suSi: [15.7, 15.2, 16.3], jeongSi: [5.6, 5.3, 5.9] },
    '고려대학교_의학과':         { suSi: [23.1, 22.4, 24.5], jeongSi: [8.9, 8.5, 9.3] },
    '한국과학기술원_전산학부':   { suSi: [8.6, 8.1, 9.2], jeongSi: [3.4, 3.1, 3.8] },
    '한국과학기술원_수리과학과': { suSi: [5.2, 4.9, 5.7], jeongSi: [2.1, 2.0, 2.4] },
    '한국과학기술원_물리학과':   { suSi: [4.8, 4.5, 5.1], jeongSi: [1.9, 1.8, 2.2] },
    '성균관대학교_소프트웨어학과': { suSi: [10.3, 9.8, 11.2], jeongSi: [4.1, 3.9, 4.5] },
    '성균관대학교_글로벌경영학과': { suSi: [13.6, 13.1, 14.2], jeongSi: [4.9, 4.7, 5.3] },
    '성균관대학교_의예과':       { suSi: [21.4, 20.8, 22.7], jeongSi: [7.8, 7.5, 8.3] },
  };

  const years = [2022, 2023, 2024];
  const rateRows: typeof competitionRates.$inferInsert[] = [];

  for (const dept of insertedDepts) {
    const univ = univData.find((u) => u.name === Object.keys(univMap).find((k) => univMap[k] === dept.universityId));
    const univName = Object.keys(univMap).find((k) => univMap[k] === dept.universityId) ?? '';
    const key = `${univName}_${dept.name}`;
    const config = rateConfig[key];
    if (!config) continue;

    for (let i = 0; i < years.length; i++) {
      const year = years[i];

      // 수시
      const suSiRate = config.suSi[i];
      const suSiAccepted = Math.round(30 + Math.random() * 20);
      rateRows.push({
        departmentId: dept.id,
        admissionTypeId: suSi,
        year,
        applicants: Math.round(suSiAccepted * suSiRate),
        accepted: suSiAccepted,
        rate: suSiRate,
      });

      // 정시
      const jeongSiRate = config.jeongSi[i];
      const jeongSiAccepted = Math.round(15 + Math.random() * 10);
      rateRows.push({
        departmentId: dept.id,
        admissionTypeId: jeongSi,
        year,
        applicants: Math.round(jeongSiAccepted * jeongSiRate),
        accepted: jeongSiAccepted,
        rate: jeongSiRate,
      });
    }
  }

  await db.insert(competitionRates).values(rateRows);
  console.log(`경쟁률 데이터 ${rateRows.length}건 삽입 완료`);

  client.close();
  console.log('\n✅ 시드 완료!');
}

seed().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
