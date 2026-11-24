import { addDaysIso, todayKstIso } from "@/lib/utils";
import { parseReservationText } from "@/lib/mail/parse";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { corporateNameMatcher } from "../_shared/guest-name";
import { KENSINGTON } from "./config";

/**
 * 켄싱턴 '나의 예약관리'(분양회원 예약 목록) → `/mail`의 예약정보.
 *
 * `/myreservation/master_reservation_list`는 서버가 그린 페이지이고 예약 한 건이 `dt`/`dd` 쌍의 묶음이다
 * (예약번호 · 숙박자 성명/연락처 · 예약상태 · 호텔/리조트 · 객실 · 체크인/체크아웃 · 요금). 기본 기간은
 * 오늘부터 6개월이고 `search_sdate`/`search_edate`(YYYYMMDD)로 넓힌다. 실측 11건, 1.8초.
 * 조사 기록은 `docs/crawlers/kensington.md`의 "## 예약내역".
 *
 * - 숙박자 칸은 `이름<span>전화번호</span>` 꼴이다. **이름(첫 글자 노드)만** 읽는다.
 * - 법인 명의 예약은 숙박자 이름이 회사명이다. 회사명은 `/mypage/mem_info`의 '회사명' 칸에서 읽어 비교한다.
 * - **읽기 전용.** 같은 페이지의 취소·결제 폼(`form_cancel_*`, `pay_frm`)은 건드리지 않는다.
 */

const LIST_URL = `${KENSINGTON.baseUrl}/myreservation/master_reservation_list`;
const MEMBER_INFO_URL = `${KENSINGTON.baseUrl}/mypage/mem_info`;
const SPAN_DAYS = 364;

interface Block {
  resNo: string;
  guest: string;
  status: string;
  hotel: string;
  room: string;
  stay: string;
  price: string;
}

const compact = (iso: string) => iso.replace(/-/g, "");

/**
 * 브라우저 안에서 도는 코드는 **문자열**로 넘긴다. 함수로 넘기면 `tsx`(esbuild keepNames)가
 * 안쪽 화살표 함수에 `__name(...)`을 감싸 넣는데 그 도우미는 페이지에 없어서 ReferenceError가 난다.
 *
 * 예약 한 건 = '예약번호' dt에서 '요금' dt가 나올 때까지 올라간 조상 안의 dt/dd 쌍.
 * 숙박자 칸은 `이름<span>전화번호</span>`이라 첫 글자 노드만 읽는다.
 */
const READ_BLOCKS = `(() => {
  var text = function (el) { return ((el && el.textContent) || "").replace(/\\s+/g, " ").trim(); };
  var dts = Array.prototype.slice.call(document.querySelectorAll("dt"));
  return dts.filter(function (dt) { return text(dt) === "예약번호"; }).map(function (dt) {
    var box = dt.parentElement;
    while (box && !Array.prototype.some.call(box.querySelectorAll("dt"), function (d) { return text(d) === "요금"; })) box = box.parentElement;
    var field = function (label) {
      var hit = Array.prototype.find.call(box ? box.querySelectorAll("dt") : [], function (d) { return text(d) === label; });
      return hit ? hit.nextElementSibling : null;
    };
    var guestDd = field("숙박자 성명/연락처");
    var guestNode = guestDd ? Array.prototype.find.call(guestDd.childNodes, function (n) { return n.nodeType === 3 && (n.textContent || "").trim(); }) : null;
    return {
      resNo: text(field("예약번호")),
      guest: guestNode ? guestNode.textContent.trim() : "",
      status: text(field("예약상태")),
      hotel: text(field("호텔/리조트")),
      room: text(field("객실")),
      stay: text(field("체크인/체크아웃")),
      price: text(field("요금")),
    };
  });
})()`;

const READ_COMPANY = `(() => {
  var dt = Array.prototype.find.call(document.querySelectorAll("dt, th"), function (e) { return (e.textContent || "").trim() === "회사명"; });
  var v = dt && dt.nextElementSibling ? (dt.nextElementSibling.textContent || "").replace(/\\s+/g, " ").trim() : "";
  return v || null;
})()`;

export async function fetchReservations(ctx: CrawlerContext): Promise<FetchedReservation[]> {
  const { page, log } = ctx;
  const from = todayKstIso();

  const q = new URLSearchParams({
    search_sdate: compact(from),
    search_edate: compact(addDaysIso(from, SPAN_DAYS)),
  });
  await page.goto(`${LIST_URL}?${q}`, {
    waitUntil: "domcontentloaded",
    timeout: KENSINGTON.timeouts.navigation,
  });
  // 익명이면 첫 화면(`/`)으로 돌려보낸다.
  if (!/\/myreservation\//.test(page.url())) {
    throw new SessionLostError(`켄싱턴 예약관리가 열리지 않음. url=${page.url()}`);
  }

  const blocks = (await page.evaluate(READ_BLOCKS)) as Block[];

  const company = await readCompanyName(ctx);
  const isCorp = corporateNameMatcher(company);

  const out: FetchedReservation[] = [];
  for (const [i, b] of blocks.entries()) {
    if (/취소/.test(b.status)) continue;
    const dates = [...b.stay.matchAll(/(\d{4})(\d{2})(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    const [checkin, checkout] = dates;
    if (!checkin || !checkout || checkout <= checkin || checkin < from) continue;
    const amt = Number((b.price.match(/[\d,]+/)?.[0] ?? "").replace(/,/g, ""));
    out.push({
      key: `${i}`,
      name: b.guest && !(company && isCorp(b.guest)) ? b.guest : null,
      resNo: b.resNo || null,
      checkin,
      checkout,
      price: Number.isFinite(amt) && amt > 0 ? amt : null,
      // "켄싱턴리조트 설악밸리" → 붙여넣기 파서의 지역 사전("설악밸리")과 같은 규칙.
      region: b.hotel ? (parseReservationText(b.hotel, "kensington").region ?? b.hotel) : null,
      roomType: b.room || null,
      status: b.status,
    });
  }
  out.sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  log("[kensington] reservations fetched", { blocks: blocks.length, kept: out.length, company: Boolean(company) });
  return out;
}

/**
 * 법인 회원의 회사명. 실패해도 던지지 않는다 — 회사명을 모르면 이름을 그대로 보여줄 뿐이고
 * (사람이 보고 고친다), 그 때문에 목록 전체를 잃을 이유는 없다.
 */
async function readCompanyName(ctx: CrawlerContext): Promise<string | null> {
  try {
    await ctx.page.goto(MEMBER_INFO_URL, {
      waitUntil: "domcontentloaded",
      timeout: KENSINGTON.timeouts.navigation,
    });
    return (await ctx.page.evaluate(READ_COMPANY)) as string | null;
  } catch {
    return null;
  }
}
