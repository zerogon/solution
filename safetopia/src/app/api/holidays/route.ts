import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  HolidayLabelMismatchError,
  getKoreanHolidays,
} from "@/lib/holidays-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 공휴일 프록시. 세션 게이트는 proxy.ts가 걸지만 여기서 한 번 더 확인한다.
 * 파라미터가 없다 — 한 문서가 모든 연도를 덮는다. 서비스워커가 이 경로만 SWR로 캐시한다.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getKoreanHolidays());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: e instanceof HolidayLabelMismatchError ? "label_mismatch" : "upstream_failed", message },
      { status: 502 },
    );
  }
}
