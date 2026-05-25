import { NextRequest, NextResponse } from "next/server";
import { getTodayStats, getDailyStats, getMonthlyStats, getIdeas } from "@/db/queries";

export async function GET(request: NextRequest) {
  const password = request.nextUrl.searchParams.get("password");

  if (password !== "300") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [today, daily, monthly, ideas] = await Promise.all([
    getTodayStats(),
    getDailyStats(30),
    getMonthlyStats(12),
    getIdeas(),
  ]);

  return NextResponse.json({ today, daily, monthly, ideas });
}
