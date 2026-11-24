import { todayKstIso, addDaysIso } from "@/lib/utils";
import { parseReservationText } from "@/lib/mail/parse";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { corporateNameMatcher } from "../_shared/guest-name";
import { SONO } from "./config";

/**
 * 소노 마이소노 '객실 예약' → `/mail`의 예약정보.
 *
 * 화면(`/mysono/pc/reserve/room`)은 달별 건수(`mysono/room/months`) → 날짜별 건수(`days`) →
 * 목록(`details`) 순으로 부른다. 우리는 목록을 곧바로 묻는다 —
 * `GET {apiBase}/memberReservation/mysono/room/details?startYmd&endYmd&type=use&page&size`.
 * `type=use`는 '이용일' 기준(체크인), 응답은 `{ success, body[], pageInfo }`.
 * 조사 기록은 `docs/crawlers/sono.md`의 "### 예약내역".
 *
 * - **읽기 전용.** 결제·취소·환불 콜은 부르지 않는다.
 * - 응답에 연락처·이메일·회원번호·차량번호가 있다. 읽는 칸만 선언하고 이름은 로그에 남기지 않는다.
 * - 선결제 기한은 채우지 않는다. 행의 `vactDate`는 가상계좌 입금기한이라 '추후결제' 예약에는
 *   비어 있다(실측). 틀린 기한을 메일에 넣느니 칸을 비워 사람이 넣게 한다.
 */

const LIST_URL = `${SONO.apiBase}/memberReservation/mysono/room/details`;
const COMMON = { lang: "ko", deviceType: "PC", mobileAppYn: "N" } as const;
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const SPAN_DAYS = 364;

interface ListRow {
  /** 화면의 '예약번호' (4자리). `keyRsvNo`는 내부 10자리. */
  rsvNo?: string;
  /** 이용자 */
  guestNm?: string | null;
  /** 예약자(법인 계정이면 회사명) */
  rsvGuestLnm?: string | null;
  storeNm?: string | null;
  rmTypeCdNm?: string | null;
  viewNm?: string | null;
  cookNm?: string | null;
  ciYmd?: string;
  coYmd?: string;
  totAmt?: string | number | null;
  rsvStatNm?: string | null;
  dataStatNm?: string | null;
}

interface ListPayload {
  success?: boolean;
  body?: ListRow[];
  pageInfo?: { isLast?: boolean; totalPages?: number };
  error?: unknown;
}

const compact = (iso: string) => iso.replace(/-/g, "");
const isoOf = (ymd: string | undefined) => {
  const m = (ymd ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export async function fetchReservations(ctx: CrawlerContext): Promise<FetchedReservation[]> {
  const { page, log } = ctx;
  const from = todayKstIso();
  const rows: ListRow[] = [];

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const q = new URLSearchParams({
      ...COMMON,
      startYmd: compact(from),
      endYmd: compact(addDaysIso(from, SPAN_DAYS)),
      type: "use",
      page: String(pageNo),
      size: String(PAGE_SIZE),
    });
    const res = await page.request.get(`${LIST_URL}?${q}`, {
      timeout: SONO.timeouts.api,
      headers: { Accept: "application/json" },
    });
    if (res.status() === 401 || res.status() === 403) throw new SessionLostError(`소노 예약내역 ${res.status()}`);
    if (!res.ok()) throw new Error(`소노 예약내역 ${res.status()}`);
    const payload = (await res.json()) as ListPayload;
    // 세션이 풀리면 200 안에 success:false로 온다.
    if (payload.success === false || !Array.isArray(payload.body)) {
      throw new SessionLostError("소노 예약내역 거절 (success=false)");
    }
    rows.push(...payload.body);
    const info = payload.pageInfo;
    if (payload.body.length === 0 || info?.isLast || pageNo >= (info?.totalPages ?? 1)) break;
  }

  const out: FetchedReservation[] = [];
  for (const [i, r] of rows.entries()) {
    const status = (r.rsvStatNm ?? r.dataStatNm ?? "").trim();
    if (/취소/.test(`${r.rsvStatNm ?? ""} ${r.dataStatNm ?? ""}`)) continue;
    const checkin = isoOf(r.ciYmd);
    const checkout = isoOf(r.coYmd);
    if (!checkin || !checkout || checkout <= checkin || checkin < from) continue;

    const guest = (r.guestNm ?? "").trim();
    const isCorp = corporateNameMatcher(r.rsvGuestLnm);
    const amt = Number(String(r.totAmt ?? "").replace(/,/g, ""));
    const store = (r.storeNm ?? "").trim();
    out.push({
      key: `${i}`,
      name: guest && !(r.rsvGuestLnm && isCorp(guest)) ? guest : null,
      resNo: r.rsvNo?.trim() || null,
      checkin,
      checkout,
      price: Number.isFinite(amt) && amt > 0 ? amt : null,
      // 붙여넣기 파서와 같은 규칙으로 지점명에서 지역을 뽑는다("소노펠리체 델피노" → 델피노).
      region: store ? (parseReservationText(store, "daemyung").region ?? store) : null,
      // 화면 표기("골드 설악마운틴 …")와 같은 순서. 취사/클린 구분이 메일 표본("스위트 취사")에 있다.
      roomType: [r.rmTypeCdNm, r.viewNm, r.cookNm].map((s) => (s ?? "").trim()).filter(Boolean).join(" ") || null,
      status,
    });
  }
  out.sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  log("[sono] reservations fetched", { rows: rows.length, kept: out.length });
  return out;
}
