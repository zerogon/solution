import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { departments, universities } from '@/db/schema';
import { like, eq, and, sql, SQL } from 'drizzle-orm';

// GET /api/departments
// Query params: universityId?, category?, search?, page?, limit?
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const universityId = searchParams.get('universityId');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  // 필터 조건 구성
  const conditions: SQL[] = [];
  if (universityId) conditions.push(eq(departments.universityId, parseInt(universityId, 10)));
  if (category) conditions.push(eq(departments.category, category));
  if (search) conditions.push(like(departments.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // 전체 카운트 조회
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(departments)
    .where(where);

  // 학과 + 대학명 조인하여 조회
  const data = await db
    .select({
      id: departments.id,
      universityId: departments.universityId,
      name: departments.name,
      category: departments.category,
      universityName: universities.name,
    })
    .from(departments)
    .innerJoin(universities, eq(departments.universityId, universities.id))
    .where(where)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ data, total, page });
}
