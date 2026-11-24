import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { fetchResortReservations } from "@/crawlers/reservations-run";
import { isMailResortKey } from "@/lib/mail/resorts";
import {
  FETCHABLE_RESORTS,
  NAME_QUERY_MAX,
  needsNameToFetch,
  type FetchReservationsResponse,
} from "@/lib/mail/reservation";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 구성원 이름이 들어 있다 — 브라우저·서비스워커·중간 캐시 어디에도 남기지 않는다. */
const NO_STORE = { "Cache-Control": "no-store, private" };

/**
 * `GET /api/mail/reservations?resort=hanwha[&name=홍길동]` — 그 리조트의 앞으로의 예약 목록.
 * `name`은 사이트가 이름으로 찾아 주는 리조트(롯데)에서 필수이고, 나머지는 무시한다.
 *
 * 리조트 사이트에 실제로 로그인해서 예약내역을 읽으므로 콜드 로그인이면 20~30초가 걸린다.
 * 결과는 저장하지 않고, 로그에는 건수만 남긴다(`reservations.ts`).
 */
export async function GET(req: Request) {
  await requireSession();
  const params = new URL(req.url).searchParams;
  const key = params.get("resort");
  const slug = isMailResortKey(key) ? FETCHABLE_RESORTS[key] : undefined;
  if (!isMailResortKey(key) || !slug) {
    return NextResponse.json({ error: "unsupported_resort" }, { status: 400, headers: NO_STORE });
  }
  const name = (params.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_QUERY_MAX);
  // 브라우저를 띄우기 전에 거른다 — 이름 없이 부르면 어차피 사이트에 아무것도 묻지 않는다.
  if (needsNameToFetch(key) && !name) {
    return NextResponse.json(
      { error: "name_required", message: "이름을 넣고 불러와 주세요." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const reservations = await fetchResortReservations(slug, { name: name || undefined });
    const body: FetchReservationsResponse = { reservations, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[reservations ${slug}] failed`, message);
    return NextResponse.json({ error: "fetch_failed", message }, { status: 502, headers: NO_STORE });
  }
}
