import { NextRequest, NextResponse } from "next/server";
import { recordSelection } from "@/db/queries";

export async function POST(request: NextRequest) {
  const { sessionId, wordId } = await request.json();

  if (!sessionId || !wordId) {
    return NextResponse.json(
      { error: "sessionId and wordId required" },
      { status: 400 }
    );
  }

  const result = await recordSelection(sessionId, wordId);

  if (!result) {
    return NextResponse.json(
      { error: "이미 오늘 단어를 선택했습니다." },
      { status: 409 }
    );
  }

  return NextResponse.json(result);
}
