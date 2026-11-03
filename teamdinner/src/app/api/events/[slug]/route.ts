import { NextResponse } from "next/server";

import { jsonError, parseBody } from "@/lib/api";
import { deleteEvent, findEventBySlug, loadEventPayload, updateEvent } from "@/lib/events";
import { SLUG_RE } from "@/lib/slug";
import { updateEventSchema } from "@/lib/validators";

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

/** 제목·날짜·인원 수정. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");
  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  const body = await parseBody(req, updateEventSchema);
  if (!body.ok) return body.res;

  const updated = await updateEvent(event, body.data);
  return NextResponse.json(updated);
}

/** 회식 삭제 — 담긴 메뉴·장바구니도 함께(FK cascade). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");
  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  await deleteEvent(event);
  return NextResponse.json({ ok: true });
}
