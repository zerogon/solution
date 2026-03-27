/**
 * ETL 데이터 DB 적재 모듈
 * 크롤링/파싱된 데이터를 실제 DB에 upsert
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, and } from 'drizzle-orm';
import {
  universities,
  departments,
  admissionTypes,
  competitionRates,
} from '@/db/schema';

// ── 타입 ──

export interface RateRecord {
  universityName: string;
  departmentName: string;
  region: string;
  universityType: string;
  departmentCategory: string;
  year: number;
  admissionType: string;
  applicants: number;
  accepted: number;
  rate: number;
}

// ── DB 연결 ──

function createDb() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return { db: drizzle(client), client };
}

// ── Upsert 함수들 ──

/** 대학 upsert (이름 기준) */
async function upsertUniversity(
  db: ReturnType<typeof drizzle>,
  name: string,
  region: string,
  type: string
): Promise<number> {
  const existing = await db
    .select()
    .from(universities)
    .where(eq(universities.name, name))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const result = await db
    .insert(universities)
    .values({ name, region, type })
    .returning();
  return result[0].id;
}

/** 학과 upsert (대학ID + 이름 기준) */
async function upsertDepartment(
  db: ReturnType<typeof drizzle>,
  universityId: number,
  name: string,
  category: string
): Promise<number> {
  const existing = await db
    .select()
    .from(departments)
    .where(and(eq(departments.universityId, universityId), eq(departments.name, name)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const result = await db
    .insert(departments)
    .values({ universityId, name, category })
    .returning();
  return result[0].id;
}

/** 입시유형 upsert */
async function upsertAdmissionType(
  db: ReturnType<typeof drizzle>,
  name: string
): Promise<number> {
  const existing = await db
    .select()
    .from(admissionTypes)
    .where(eq(admissionTypes.name, name))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const result = await db
    .insert(admissionTypes)
    .values({ name })
    .returning();
  return result[0].id;
}

/** 경쟁률 중복 체크 후 삽입 */
async function insertRateIfNew(
  db: ReturnType<typeof drizzle>,
  departmentId: number,
  admissionTypeId: number,
  year: number,
  applicants: number,
  accepted: number,
  rate: number
): Promise<boolean> {
  const existing = await db
    .select()
    .from(competitionRates)
    .where(
      and(
        eq(competitionRates.departmentId, departmentId),
        eq(competitionRates.admissionTypeId, admissionTypeId),
        eq(competitionRates.year, year)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return false; // 이미 존재
  }

  await db.insert(competitionRates).values({
    departmentId,
    admissionTypeId,
    year,
    applicants,
    accepted,
    rate,
  });
  return true;
}

// ── 메인 로딩 함수 ──

export interface LoadResult {
  totalRecords: number;
  inserted: number;
  skipped: number;
  universities: number;
  departments: number;
  errors: string[];
}

/**
 * RateRecord 배열을 DB에 적재
 */
export async function loadRates(records: RateRecord[]): Promise<LoadResult> {
  const { db, client } = createDb();

  const result: LoadResult = {
    totalRecords: records.length,
    inserted: 0,
    skipped: 0,
    universities: 0,
    departments: 0,
    errors: [],
  };

  // ID 캐시 (중복 쿼리 방지)
  const univCache = new Map<string, number>();
  const deptCache = new Map<string, number>();
  const typeCache = new Map<string, number>();

  try {
    for (const record of records) {
      try {
        // 대학 upsert
        let univId = univCache.get(record.universityName);
        if (!univId) {
          univId = await upsertUniversity(db, record.universityName, record.region, record.universityType);
          univCache.set(record.universityName, univId);
          result.universities++;
        }

        // 학과 upsert
        const deptKey = `${record.universityName}::${record.departmentName}`;
        let deptId = deptCache.get(deptKey);
        if (!deptId) {
          deptId = await upsertDepartment(db, univId, record.departmentName, record.departmentCategory);
          deptCache.set(deptKey, deptId);
          result.departments++;
        }

        // 입시유형 upsert
        let typeId = typeCache.get(record.admissionType);
        if (!typeId) {
          typeId = await upsertAdmissionType(db, record.admissionType);
          typeCache.set(record.admissionType, typeId);
        }

        // 경쟁률 삽입
        const inserted = await insertRateIfNew(
          db,
          deptId,
          typeId,
          record.year,
          record.applicants,
          record.accepted,
          record.rate
        );

        if (inserted) {
          result.inserted++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${record.universityName} ${record.departmentName} ${record.year}: ${msg}`);
      }
    }
  } finally {
    client.close();
  }

  return result;
}
