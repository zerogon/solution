import { NextResponse } from "next/server";
import { getTodayStats } from "@/db/queries";

export async function GET() {
  const stats = await getTodayStats();
  return NextResponse.json(stats);
}
