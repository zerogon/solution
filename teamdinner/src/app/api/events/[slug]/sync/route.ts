import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { findEventBySlug, syncEventMenus } from "@/lib/events";
import { NaverFetchError } from "@/lib/naver";
import { SLUG_RE } from "@/lib/slug";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** 네이버 메뉴 다시 가져오기 (upsert, 삭제 없음). */
export async function POST(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");
  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  try {
    const result = await syncEventMenus(event);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NaverFetchError) return jsonError(502, err.message);
    if (err instanceof Error && err.name === "TimeoutError") {
      return jsonError(504, "네이버 응답이 너무 느립니다. 잠시 후 다시 시도해 주세요.");
    }
    console.error("[POST /api/events/[slug]/sync]", err);
    return jsonError(500, "메뉴를 다시 가져오지 못했습니다.");
  }
}
