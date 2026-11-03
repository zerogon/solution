import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { findEventBySlug, loadEventPayload } from "@/lib/events";
import { SLUG_RE } from "@/lib/slug";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** 폴링 엔드포인트 — 회식·메뉴·장바구니를 한 번에. */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");

  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  const payload = await loadEventPayload(event);
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
