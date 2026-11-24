import { addDaysIso, todayKstIso } from "@/lib/utils";
import { MAIL_RESORTS } from "@/lib/mail/resorts";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { corporateNameMatcher } from "../_shared/guest-name";
import { RESOM } from "./config";
import { authHeaders, readAuth } from "./login";

/**
 * 리솜(호반) 마이페이지 '예약조회' → `/mail`의 예약정보.
 *
 * SPA의 `myReservation` 스토어가 부르는 `GET {apiBase}/roomReservation/selectReservationList`를
 * 그대로 재현한다. 파라미터는 번들의 조건 객체(`status=R` · `type=room` · `rsvStatCdList=RS` ·
 * 체크인 기간 `start`~`end` · `memberShip`=`capMemNo` · `allDataYn=Y`)와 페이지(`page`/`size`)이고,
 * 전체 건수는 `x-total-count` 헤더로 온다. 조사 기록은 `docs/crawlers/resom.md`의 "### 예약내역".
 *
 * - **읽기 전용.** 같은 화면의 취소·변경·메일 발송 콜은 부르지 않는다.
 * - 응답에는 연락처·회원번호·내부 예약키가 있다. 읽는 칸만 선언하고 이름은 로그에 남기지 않는다.
 */

const LIST_URL = `${RESOM.apiBase}/roomReservation/selectReservationList`;
const PAGE_SIZE = 100;
/** 실측 204건(3페이지). 법인 계정의 1년치가 이 위를 넘을 일은 없지만 무한 루프는 막는다. */
const MAX_PAGES = 10;
/** 사이트 화면의 기본 기간과 같다 — 오늘부터 12개월 − 1일. */
const SPAN_DAYS = 364;

interface ListRow {
  /** 화면의 '예약번호' (4자리). */
  rsvNo?: string;
  guestNm?: string | null;
  condoNm?: string | null;
  rmTypeNm?: string | null;
  /** 화면의 '투숙객실' — 있으면 이것, 없으면 `rmTypeNm`. */
  roomSaleName?: string | null;
  ciYmd?: string;
  coYmd?: string;
  rmAmt?: string | number | null;
  rsvStatNm?: string | null;
}

interface AuthInfo {
  member?: { capMemNo?: string; memNm?: string };
}

const compact = (iso: string) => iso.replace(/-/g, "");
const isoOf = (ymd: string | undefined) => {
  const m = (ymd ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export async function fetchReservations(ctx: CrawlerContext): Promise<FetchedReservation[]> {
  const { page, log } = ctx;
  const auth = await readAuth(ctx);
  if (!auth) throw new SessionLostError("리솜 인증 토큰 없음");
  const headers = authHeaders(auth);

  const infoRes = await page.request.get(`${RESOM.apiBase}/auth/info`, {
    timeout: RESOM.timeouts.api,
    headers,
  });
  if (infoRes.status() === 401 || !infoRes.ok()) {
    throw new SessionLostError(`리솜 auth/info ${infoRes.status()}`);
  }
  const member = ((await infoRes.json()) as AuthInfo).member;
  if (!member?.capMemNo) throw new SessionLostError("리솜 회원번호(capMemNo) 없음");

  const from = todayKstIso();
  const rows: ListRow[] = [];
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const q = new URLSearchParams({
      memberShip: member.capMemNo,
      allDataYn: "Y",
      status: "R",
      type: "room",
      // 예약조회 탭 = 예약 상태(RS)만. 취소내역은 CC,NS다.
      rsvStatCdList: "RS",
      selectedSearchMode: "12",
      start: compact(from),
      end: compact(addDaysIso(from, SPAN_DAYS)),
      page: String(pageNo),
      size: String(PAGE_SIZE),
    });
    const res = await page.request.get(`${LIST_URL}?${q}`, { timeout: RESOM.timeouts.api, headers });
    if (res.status() === 401) throw new SessionLostError("리솜 예약내역 401");
    if (!res.ok()) throw new Error(`리솜 예약내역 ${res.status()}`);
    const batch = (await res.json()) as unknown;
    if (!Array.isArray(batch)) throw new Error("리솜 예약내역 응답이 배열이 아님");
    rows.push(...(batch as ListRow[]));
    const total = Number(res.headers()["x-total-count"]);
    if (batch.length < PAGE_SIZE || (Number.isFinite(total) && rows.length >= total)) break;
  }

  const corp = corporateNameMatcher(member.memNm);
  const out: FetchedReservation[] = [];
  for (const [i, r] of rows.entries()) {
    const status = (r.rsvStatNm ?? "").trim();
    if (/취소|노쇼/.test(status)) continue;
    const checkin = isoOf(r.ciYmd);
    const checkout = isoOf(r.coYmd);
    if (!checkin || !checkout || checkout <= checkin || checkin < from) continue;
    const guest = (r.guestNm ?? "").trim();
    const amt = Number(String(r.rmAmt ?? "").replace(/,/g, ""));
    out.push({
      key: `${i}`,
      name: guest && !corp(guest) ? guest : null,
      resNo: r.rsvNo?.trim() || null,
      checkin,
      checkout,
      price: Number.isFinite(amt) && amt > 0 ? amt : null,
      region: regionOf(r.condoNm),
      roomType: (r.roomSaleName || r.rmTypeNm || "").trim() || null,
      status,
    });
  }
  // 사이트 응답은 체크인 순이 아니다(실측). 목록은 가까운 날짜부터 보여야 한다.
  out.sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  log("[resom] reservations fetched", { rows: rows.length, kept: out.length });
  return out;
}

/**
 * 리조트명 → 메일의 객실지역. 사전(`MAIL_RESORTS.hoban.regionMap`)이 리조트 이름의 핵심어를
 * 지역으로 잇는다("레스트리"·"포레스트" → 제천, "스플라스" → 덕산, "아일랜드" → 안면도).
 * 사전에 없으면 사이트의 리조트명을 그대로 쓴다.
 */
function regionOf(condoNm: string | null | undefined): string | null {
  const name = (condoNm ?? "").trim();
  if (!name) return null;
  const map = MAIL_RESORTS.hoban.regionMap ?? {};
  const hit = Object.keys(map).find((k) => name.includes(k));
  return hit ? map[hit] : name;
}
