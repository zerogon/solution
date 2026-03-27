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
    { name: '경희대학교', region: '서울', type: '사립' },
    { name: '동덕여자대학교', region: '서울', type: '사립' },
    { name: '홍익대학교', region: '서울', type: '사립' },
    { name: '서경대학교', region: '서울', type: '사립' },
    { name: '성신여자대학교', region: '서울', type: '사립' },
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
    // 경희대학교
    { universityId: univMap['경희대학교'], name: 'PostModern음악학과', category: '예체능' },
    // 동덕여자대학교
    { universityId: univMap['동덕여자대학교'], name: '공연예술학부 실용음악전공', category: '예체능' },
    // 홍익대학교
    { universityId: univMap['홍익대학교'], name: '공연예술학부(실용음악전공)', category: '예체능' },
    // 서경대학교
    { universityId: univMap['서경대학교'], name: '실용음악학부(보컬,싱어송라이터)', category: '예체능' },
    { universityId: univMap['서경대학교'], name: '실용음악학부(기악)', category: '예체능' },
    { universityId: univMap['서경대학교'], name: '실용음악학부(작곡)', category: '예체능' },
    // 성신여자대학교
    { universityId: univMap['성신여자대학교'], name: '현대실용음악학과', category: '예체능' },
  ];

  const insertedDepts = await db.insert(departments).values(deptData).returning();
  console.log(`학과 ${insertedDepts.length}개 삽입 완료`);

  // ─── 경쟁률 데이터 생성 (2023~2025, 크롤링 데이터 기반) ───────
  // 학과별 경쟁률 (수시/정시 각각)
  const rateConfig: Record<string, { suSi: number[]; jeongSi: number[] }> = {
    '경희대학교_PostModern음악학과':             { suSi: [45.3, 48.2, 50.17], jeongSi: [38.5, 41.0, 43.0] },
    '동덕여자대학교_공연예술학부 실용음악전공':   { suSi: [36.8, 39.5, 41.64], jeongSi: [30.2, 33.0, 35.13] },
    '홍익대학교_공연예술학부(실용음악전공)':       { suSi: [128.5, 136.0, 143.61], jeongSi: [140.0, 148.0, 153.0] },
    '서경대학교_실용음악학부(보컬,싱어송라이터)': { suSi: [280.0, 300.0, 314.71], jeongSi: [125.0, 135.0, 142.57] },
    '서경대학교_실용음악학부(기악)':              { suSi: [35.2, 38.5, 41.58], jeongSi: [28.0, 31.0, 33.5] },
    '서경대학교_실용음악학부(작곡)':              { suSi: [40.0, 43.5, 46.75], jeongSi: [32.0, 35.0, 37.5] },
    '성신여자대학교_현대실용음악학과':            { suSi: [50.0, 54.5, 58.57], jeongSi: [30.0, 33.0, 35.67] },
  };

  const years = [2023, 2024, 2025];
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
