import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { universities } from '@/db/schema';
import { like, eq, and, sql, SQL } from 'drizzle-orm';

// GET /api/universities
// Query params: region?, type?, search?, page?, limit?
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const region = searchParams.get('region');
  const type = searchParams.get('type');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  // 필터 조건 구성
  const conditions: SQL[] = [];
  if (region) conditions.push(eq(universities.region, region));
  if (type) conditions.push(eq(universities.type, type));
  if (search) conditions.push(like(universities.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // 전체 카운트 및 데이터 조회
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(universities)
    .where(where);

  const data = await db
    .select()
    .from(universities)
    .where(where)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ data, total, page });
}
