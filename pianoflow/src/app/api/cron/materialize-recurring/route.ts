import { NextResponse } from "next/server";
import { materializeRecurringReservations } from "@/lib/recurring";

// 매주 월요일 0시(KST)=일요일 15:00 UTC에 Vercel Cron이 호출.
// bookingHorizon이 그 시각에 한 주 전진하므로, 새로 예약 창에 들어온 주차의
// 고정 예약을 실체화한다. 세션이 아닌 CRON_SECRET Bearer 토큰으로 인증.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await materializeRecurringReservations(new Date());
  return NextResponse.json(result);
}
