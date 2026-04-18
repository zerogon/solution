import { NextResponse } from "next/server";
import { getActiveSentences } from "@/db/queries";

function getDateSeed(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  return year * 10000 + month * 100 + day;
}

export async function GET() {
  const sentences = await getActiveSentences();

  if (sentences.length === 0) {
    return NextResponse.json({ sentence: "오늘도 좋은 하루 보내세요!" });
  }

  const seed = getDateSeed();
  const index = seed % sentences.length;

  return NextResponse.json({ sentence: sentences[index].text });
}
