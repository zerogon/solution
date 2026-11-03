import { NextResponse } from "next/server";

import { jsonError, parseBody } from "@/lib/api";
import { createEvent } from "@/lib/events";
import { NaverFetchError, NaverLinkError } from "@/lib/naver";
import { createEventSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** 회식 만들기: 링크 → 메뉴 수집 → 저장. */
export async function POST(req: Request) {
  const body = await parseBody(req, createEventSchema);
  if (!body.ok) return body.res;

  try {
    const result = await createEvent(body.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof NaverLinkError) return jsonError(400, err.message);
    if (err instanceof NaverFetchError) return jsonError(502, err.message);
    if (err instanceof Error && err.name === "TimeoutError") {
      return jsonError(504, "네이버 응답이 너무 느립니다. 잠시 후 다시 시도해 주세요.");
    }
    console.error("[POST /api/events]", err);
    return jsonError(500, "회식을 만들지 못했습니다.");
  }
}
