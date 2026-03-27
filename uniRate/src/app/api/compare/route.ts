import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { competitionRates, departments, universities, admissionTypes } from '@/db/schema';
import { eq, and, gte, lte, inArray, SQL } from 'drizzle-orm';

// GET /api/compare
// Query params: departmentIds (필수, 콤마구분), admissionTypeId?, yearFrom?, yearTo?
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const departmentIdsParam = searchParams.get('departmentIds');
  if (!departmentIdsParam) {
    return NextResponse.json({ error: 'departmentIds is required' }, { status: 400 });
  }

  const deptIds = departmentIdsParam
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (deptIds.length === 0) {
    return NextResponse.json({ error: 'Valid departmentIds are required' }, { status: 400 });
  }

  const admissionTypeId = searchParams.get('admissionTypeId');
  const yearFrom = searchParams.get('yearFrom');
  const yearTo = searchParams.get('yearTo');

  // 요청한 모든 학과 + 대학 정보 조회
  const deptInfos = await db
    .select({
      department: {
        id: departments.id,
        name: departments.name,
        category: departments.category,
        universityId: departments.universityId,
      },
      university: {
        id: universities.id,
        name: universities.name,
        region: universities.region,
        type: universities.type,
      },
    })
    .from(departments)
    .innerJoin(universities, eq(departments.universityId, universities.id))
    .where(inArray(departments.id, deptIds));

  // 경쟁률 필터 조건 구성
  const rateConditions: SQL[] = [inArray(competitionRates.departmentId, deptIds)];
  if (admissionTypeId) rateConditions.push(eq(competitionRates.admissionTypeId, parseInt(admissionTypeId, 10)));
  if (yearFrom) rateConditions.push(gte(competitionRates.year, parseInt(yearFrom, 10)));
  if (yearTo) rateConditions.push(lte(competitionRates.year, parseInt(yearTo, 10)));

  // 전체 경쟁률 데이터 조회
  const allRates = await db
    .select({
      id: competitionRates.id,
      departmentId: competitionRates.departmentId,
      admissionTypeId: competitionRates.admissionTypeId,
      admissionTypeName: admissionTypes.name,
      year: competitionRates.year,
      applicants: competitionRates.applicants,
      accepted: competitionRates.accepted,
      rate: competitionRates.rate,
    })
    .from(competitionRates)
    .innerJoin(admissionTypes, eq(competitionRates.admissionTypeId, admissionTypes.id))
    .where(and(...rateConditions))
    .orderBy(competitionRates.year);

  // 학과별로 경쟁률 그룹화
  const data = deptInfos.map(({ department, university }) => ({
    department,
    university,
    rates: allRates.filter((r) => r.departmentId === department.id),
  }));

  return NextResponse.json({ data });
}
