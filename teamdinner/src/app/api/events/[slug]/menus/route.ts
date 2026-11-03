import { NextResponse } from "next/server";

import { jsonError, parseBody } from "@/lib/api";
import { addCustomMenu, findEventBySlug } from "@/lib/events";
import { SLUG_RE } from "@/lib/slug";
import { customMenuSchema } from "@/lib/validators";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** 네이버에 없는 메뉴를 직접 추가한다. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return jsonError(404, "회식을 찾을 수 없습니다.");
  const event = await findEventBySlug(slug);
  if (!event) return jsonError(404, "회식을 찾을 수 없습니다.");

  const body = await parseBody(req, customMenuSchema);
  if (!body.ok) return body.res;

  const menu = await addCustomMenu(event, body.data);
  return NextResponse.json(menu, { status: 201 });
}
