import { NextRequest, NextResponse } from "next/server";
import { getZodiacFortune } from "@/db/queries";

const VALID_ZODIACS = [
  "rat", "ox", "tiger", "rabbit", "dragon", "snake",
  "horse", "sheep", "monkey", "rooster", "dog", "pig",
];

function getDayOfYearKST(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const startOfYear = new Date(Date.UTC(kst.getUTCFullYear(), 0, 1));
  const diff = kst.getTime() - startOfYear.getTime();
  const day = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(day, 365);
}

function getTodayDateKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[kst.getUTCDay()];
  return `${year}-${month}-${day} (${weekday})`;
}

export async function GET(request: NextRequest) {
  const zodiac = request.nextUrl.searchParams.get("zodiac");

  if (!zodiac || !VALID_ZODIACS.includes(zodiac)) {
    return NextResponse.json(
      { error: "유효한 띠를 선택해주세요." },
      { status: 400 }
    );
  }

  const dayOfYear = getDayOfYearKST();
  const fortune = await getZodiacFortune(zodiac, dayOfYear);

  if (!fortune) {
    return NextResponse.json(
      { error: "운세 데이터를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { zodiacKey: zodiac, date: getTodayDateKST(), fortune },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
