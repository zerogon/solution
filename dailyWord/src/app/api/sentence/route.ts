import { NextRequest, NextResponse } from "next/server";
import { getActiveSentences } from "@/db/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getKSTDateString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export async function GET(req: NextRequest) {
  const sentences = await getActiveSentences();

  if (sentences.length === 0) {
    return NextResponse.json({ sentence: "오늘도 좋은 하루 보내세요!" });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim() ?? "";
  const dateStr = getKSTDateString();
  const seed = deviceId ? fnv1a32(`${deviceId}:${dateStr}`) : fnv1a32(dateStr);
  const index = seed % sentences.length;

  return NextResponse.json({ sentence: sentences[index].text });
}
