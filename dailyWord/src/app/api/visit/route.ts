import { NextRequest, NextResponse } from "next/server";
import { recordVisit } from "@/db/queries";

export async function POST(request: NextRequest) {
  const { sessionId, userAgent } = await request.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  await recordVisit(sessionId, userAgent ?? null);
  return NextResponse.json({ ok: true });
}
