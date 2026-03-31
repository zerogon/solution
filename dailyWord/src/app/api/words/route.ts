import { NextRequest, NextResponse } from "next/server";
import { getActiveWords, getSessionSelection } from "@/db/queries";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  const wordList = await getActiveWords();

  let alreadySelected = null;
  if (sessionId) {
    alreadySelected = await getSessionSelection(sessionId);
  }

  return NextResponse.json({ words: wordList, alreadySelected });
}
