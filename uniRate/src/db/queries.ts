import { eq } from 'drizzle-orm';
import { db } from './index';
import { universities, departments, admissionTypes, competitionRates } from './schema';

/** 대시보드에 표시할 통합 경쟁률 데이터 */
export interface DashboardRate {
  universityName: string;
  universityType: string;
  region: string;
  departmentName: string;
  departmentId: number;
  admissionType: string;
  year: number;
  applicants: number;
  accepted: number;
  rate: number;
}

/**
 * 전체 경쟁률 데이터를 한 번에 조회 (서버 컴포넌트용)
 * universities + departments + admissionTypes + competitionRates JOIN
 */
export async function getAllRates(): Promise<DashboardRate[]> {
  const rows = await db
    .select({
      universityName: universities.name,
      universityType: universities.type,
      region: universities.region,
      departmentName: departments.name,
      departmentId: departments.id,
      admissionType: admissionTypes.name,
      year: competitionRates.year,
      applicants: competitionRates.applicants,
      accepted: competitionRates.accepted,
      rate: competitionRates.rate,
    })
    .from(competitionRates)
    .innerJoin(departments, eq(competitionRates.departmentId, departments.id))
    .innerJoin(universities, eq(departments.universityId, universities.id))
    .innerJoin(admissionTypes, eq(competitionRates.admissionTypeId, admissionTypes.id))
    .where(eq(departments.category, '예체능'))
    .orderBy(competitionRates.year);

  return rows;
}
