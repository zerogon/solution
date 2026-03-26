import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { competitionRates, departments, universities, admissionTypes } from '@/db/schema';
import { eq, and, gte, lte, SQL } from 'drizzle-orm';

// GET /api/rates
// Query params: departmentId (필수), admissionTypeId?, yearFrom?, yearTo?
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const departmentId = searchParams.get('departmentId');
  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId is required' }, { status: 400 });
  }

  const admissionTypeId = searchParams.get('admissionTypeId');
  const yearFrom = searchParams.get('yearFrom');
  const yearTo = searchParams.get('yearTo');

  // 학과 + 대학 정보 조회
  const [deptInfo] = await db
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
    .where(eq(departments.id, parseInt(departmentId, 10)));

  if (!deptInfo) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 });
  }

  // 경쟁률 필터 조건 구성
  const conditions: SQL[] = [
    eq(competitionRates.departmentId, parseInt(departmentId, 10)),
  ];
  if (admissionTypeId) conditions.push(eq(competitionRates.admissionTypeId, parseInt(admissionTypeId, 10)));
  if (yearFrom) conditions.push(gte(competitionRates.year, parseInt(yearFrom, 10)));
  if (yearTo) conditions.push(lte(competitionRates.year, parseInt(yearTo, 10)));

  // 경쟁률 + 입시유형명 조인 조회
  const data = await db
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
    .where(and(...conditions))
    .orderBy(competitionRates.year);

  return NextResponse.json({
    data,
    department: deptInfo.department,
    university: deptInfo.university,
  });
}
