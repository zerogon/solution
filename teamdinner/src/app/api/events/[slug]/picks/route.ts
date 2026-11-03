import { NextResponse } from "next/server";

import { jsonError, parseBody } from "@/lib/api";
import { findEventBySlug, setPick } from "@/lib/events";
import { SLUG_RE } from "@/lib/slug";
import { pickSchema } from "@/lib/validators";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** 장바구니 수량 설정. quantity 0 → 삭제. */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");
  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  const body = await parseBody(req, pickSchema);
  if (!body.ok) return body.res;

  const result = await setPick(event, body.data);
  if (result === "not-found") return jsonError(404, "이 회식의 메뉴가 아닙니다.");
  return NextResponse.json({ pick: result });
}
