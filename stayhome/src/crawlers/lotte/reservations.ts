import { addDaysIso, todayKstIso } from "@/lib/utils";
import { parseReservationText } from "@/lib/mail/parse";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { mapPool } from "../_shared/pool";

/**
 * 롯데리조트 '예약 조회' → `/mail`의 예약정보.
 *
 * **이름이 필요하다.** 목록 한 페이지가 5~10초(10건)라 1년치(실측 92건 · 10페이지)를 다 넘기면
 * 예산(50초)을 넘는다. 엑셀 내보내기(`…/excel`)는 한 번에 주지만 18초에 이름이 가려져 있고 금액이 없어,
 * 결국 예약마다 상세를 다시 물어야 한다. 대신 화면의 검색칸(`searchText`)이 투숙자 이름으로 찾아 주므로
 * (실측 ~3초) **이름으로 좁힌 뒤 그 예약들의 상세만** 묻는다(상세는 4개 동시에 ~1초).
 *
 * 이 화면은 JSON API가 아니라 **서버가 그린 HTML**이다(`homepage/reservation/view_reservation/list.js`가
 * 검색 폼을 GET으로 제출할 뿐이다). 그래서 두 단계로 읽는다.
 * 1. `GET /main/ko/reservation/view-reservation/list?…` — 행마다 `.rsv-info`의 `data-*`
 *    (`bizcd` · `rsvno` · `statuscd` · `checkindt` · `checkoutdt` …)가 붙어 있다. 목록의 투숙자 성명은
 *    사이트가 **가려서**(`홍**`) 그리고 금액 칸이 없다.
 * 2. `POST …/view-reservation/detail` (화면의 상세 버튼과 같은 폼) — 대표 투숙자 성명 · 예약 지점 ·
 *    투숙 객실 · 총 금액이 여기 있다. 취소된 예약은 부르지 않는다(사이트도 `cancel-detail`로 따로 보낸다).
 * 조사 기록은 `docs/crawlers/lotte.md`의 "### 예약내역".
 *
 * - **읽기 전용.** 상세 화면의 변경·취소 버튼에 해당하는 요청은 보내지 않는다.
 * - 상세 HTML에는 예약자(담당자) 연락처·이메일이 있다. 필요한 줄만 골라 읽고 로그에는 건수만 남긴다.
 */

const BASE = "https://resort.lottehotel.com/main/ko/reservation/view-reservation";
/** 이름으로 좁힌 결과라 한두 페이지면 끝난다. */
const MAX_PAGES = 3;
const SPAN_DAYS = 364;
/** 상세 페이지를 동시에 몇 개 묻는가. 롯데 크롤러의 지점 병렬도(4)와 같다. */
const DETAIL_POOL = 4;
const TIMEOUT_MS = 15_000;

/** 롯데는 이름 없이 부르면 안 된다 — 라우트가 400으로 바꾼다. */
export class NameRequiredError extends Error {
  constructor() {
    super("롯데리조트는 이름을 넣어야 불러올 수 있습니다");
    this.name = "NameRequiredError";
  }
}

interface ListRow {
  bizcd: string;
  rsvno: string;
  statuscd: string;
  rsvtype: string;
  isfullexclusive: string;
  checkindt: string;
  checkoutdt: string;
  roomtype: string;
}

const dotted = (iso: string) => iso.replace(/-/g, ".");
const isoOf = (ymd: string | undefined) => {
  const m = (ymd ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** `<… class="rsv-info" data-bizcd="61" …>` 요소들의 data 속성. HTML을 렌더하지 않는다. */
function listRows(html: string): ListRow[] {
  const out: ListRow[] = [];
  for (const tag of html.match(/<[^>]*class="[^"]*\brsv-info\b[^"]*"[^>]*>/g) ?? []) {
    const d: Record<string, string> = {};
    // 원문 HTML은 camelCase다(`data-rsvNo`). 브라우저 `dataset`처럼 소문자로 맞춘다.
    for (const m of tag.matchAll(/data-([A-Za-z0-9-]+)="([^"]*)"/g)) d[m[1].toLowerCase()] = m[2];
    if (d.rsvno) {
      out.push({
        bizcd: d.bizcd ?? "",
        rsvno: d.rsvno,
        statuscd: d.statuscd ?? "",
        rsvtype: d.rsvtype ?? "",
        isfullexclusive: d.isfullexclusive ?? "",
        checkindt: d.checkindt ?? "",
        checkoutdt: d.checkoutdt ?? "",
        roomtype: d.roomtype ?? "",
      });
    }
  }
  return out;
}

/** HTML → 줄 단위 글자. 블록 경계를 줄바꿈으로 바꾸고 태그를 지운다(렌더하지 않는다). */
function textLines(html: string): string[] {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|dl|dt|dd|tr|td|th|h\d|section|article|span|strong|em|label)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** `label` 줄 다음에 오는 첫 값 줄. `from`부터 찾는다. */
function after(lines: string[], label: string, from = 0): { value: string; at: number } | null {
  for (let i = from; i < lines.length - 1; i += 1) {
    if (lines[i] === label) return { value: lines[i + 1], at: i + 1 };
  }
  return null;
}

interface Detail {
  guest: string | null;
  branch: string | null;
  room: string | null;
  total: number | null;
  status: string | null;
}

/**
 * 상세 화면의 글자에서 필요한 줄만. '성명'이 두 번 나온다 — 첫째는 예약자(법인 계정이면 담당자),
 * 둘째는 '투숙자 정보' 아래의 대표 투숙자다. 메일의 예약자명은 **대표 투숙자**다(`resorts.ts` lotte 주석).
 */
function parseDetail(html: string): Detail {
  const lines = textLines(html);
  const guestBlock = lines.indexOf("투숙자 정보");
  const guest = guestBlock >= 0 ? after(lines, "성명", guestBlock) : null;
  const totalLine = after(lines, "총 금액")?.value ?? "";
  const total = Number((totalLine.match(/[\d,]+/)?.[0] ?? "").replace(/,/g, ""));
  return {
    guest: guest?.value ?? null,
    branch: after(lines, "예약 지점")?.value ?? null,
    room: after(lines, "투숙 객실")?.value ?? null,
    total: Number.isFinite(total) && total > 0 ? total : null,
    status: after(lines, "예약 상태")?.value ?? null,
  };
}

export async function fetchReservations(
  ctx: CrawlerContext,
  opts: { name?: string } = {},
): Promise<FetchedReservation[]> {
  const { page, log } = ctx;
  const name = (opts.name ?? "").trim();
  if (!name) throw new NameRequiredError();
  const from = todayKstIso();
  const rows: ListRow[] = [];
  const seen = new Set<string>();

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const q = new URLSearchParams({
      page: String(pageNo),
      bizCd: "",
      searchBizCd: "",
      searchCategory1: "ALL",
      searchCategory2: "",
      // 계정의 모든 회원번호(분양회원·리워즈)를 한꺼번에 — 화면의 '전체'.
      searchMemberNo: "allMember",
      searchCheckinDt: dotted(from),
      searchCheckoutDt: dotted(addDaysIso(from, SPAN_DAYS)),
      searchText: name,
    });
    const res = await page.request.get(`${BASE}/list?${q}`, { timeout: TIMEOUT_MS });
    if (!res.ok()) throw new Error(`롯데 예약조회 ${res.status()}`);
    // 세션이 풀리면 로그인 화면으로 돌려보낸다.
    if (/\/login/.test(res.url())) throw new SessionLostError("롯데 예약조회가 로그인으로 돌아감");
    const html = await res.text();
    const batch = listRows(html);
    const fresh = batch.filter((r) => !seen.has(r.rsvno));
    for (const r of fresh) seen.add(r.rsvno);
    rows.push(...fresh);
    // 마지막 페이지를 넘으면 사이트가 같은 마지막 페이지를 다시 주거나 빈 목록을 준다.
    if (batch.length === 0 || fresh.length === 0) break;
  }

  const active = rows.filter((r) => {
    if (/CANCEL/.test(r.statuscd)) return false;
    const ci = isoOf(r.checkindt);
    return ci !== null && ci >= from;
  });

  const details = await mapPool(active, DETAIL_POOL, async (r) => {
    const res = await page.request.post(`${BASE}/detail`, {
      timeout: TIMEOUT_MS,
      headers: { Referer: `${BASE}/list` },
      form: {
        isFullExclusive: r.isfullexclusive,
        bizCd: r.bizcd,
        rsvNo: r.rsvno,
        statusCd: r.statuscd,
        // 화면은 대기·전관 예약일 때만 날짜·객실을 싣는다. 같은 규칙을 따른다.
        checkinDt: /WAIT/.test(r.statuscd) || r.isfullexclusive === "Y" ? r.checkindt : "",
        checkoutDt: /WAIT/.test(r.statuscd) || r.isfullexclusive === "Y" ? r.checkoutdt : "",
        roomType: /WAIT/.test(r.statuscd) || r.isfullexclusive === "Y" ? r.roomtype : "",
        rsvType: r.rsvtype,
      },
    });
    if (!res.ok()) throw new Error(`롯데 예약상세 ${res.status()}`);
    return parseDetail(await res.text());
  });

  const out: FetchedReservation[] = [];
  let failed = 0;
  for (const [i, r] of active.entries()) {
    const checkin = isoOf(r.checkindt);
    const checkout = isoOf(r.checkoutdt);
    if (!checkin || !checkout || checkout <= checkin) continue;
    const d = details[i];
    // 상세 하나가 실패해도 목록 전체를 버리지 않는다 — 그 예약은 목록의 값만으로 보여준다.
    const det: Partial<Detail> = d.ok ? d.value : {};
    if (!d.ok) failed += 1;
    // 롯데의 예약자(첫 '성명')는 회사가 아니라 담당자 개인이다. 그와 같다고 지우면 담당자가
    // 자기 이름으로 잡은 예약의 이름이 사라진다. 그래서 대표 투숙자를 그대로 쓴다.
    const guest = (det.guest ?? "").trim();
    out.push({
      key: `${i}`,
      name: guest || null,
      resNo: r.rsvno,
      checkin,
      checkout,
      price: det.total ?? null,
      region: det.branch ? (parseReservationText(det.branch, "lotte").region ?? det.branch) : null,
      roomType: det.room?.trim() || null,
      status: (det.status ?? "").split("/")[0].trim() || r.statuscd,
    });
  }
  out.sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  log("[lotte] reservations fetched", { listed: rows.length, active: active.length, kept: out.length, detailFailed: failed });
  return out;
}
