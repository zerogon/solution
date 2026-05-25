import { NextRequest, NextResponse } from "next/server";
import { recordPageView } from "@/db/queries";

const VALID_PAGES = ["daily_sentence", "zodiac_fortune"];

export async function POST(request: NextRequest) {
  const { sessionId, page, deviceId } = await request.json();

  if (!sessionId || !VALID_PAGES.includes(page)) {
    return NextResponse.json(
      { error: "sessionId and valid page required" },
      { status: 400 }
    );
  }

  const normalizedDeviceId =
    typeof deviceId === "string" && deviceId.trim().length > 0
      ? deviceId.trim()
      : null;

  await recordPageView(sessionId, page, normalizedDeviceId);
  return NextResponse.json({ ok: true });
}
