import { NextRequest, NextResponse } from "next/server";
import { recordPageView } from "@/db/queries";

const VALID_PAGES = ["daily_sentence", "zodiac_fortune"];

export async function POST(request: NextRequest) {
  const { sessionId, page } = await request.json();

  if (!sessionId || !VALID_PAGES.includes(page)) {
    return NextResponse.json(
      { error: "sessionId and valid page required" },
      { status: 400 }
    );
  }

  await recordPageView(sessionId, page);
  return NextResponse.json({ ok: true });
}
