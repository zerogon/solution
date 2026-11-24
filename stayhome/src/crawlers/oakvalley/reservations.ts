import { todayKstIso } from "@/lib/utils";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { corporateNameMatcher } from "../_shared/guest-name";
import { OAKVALLEY } from "./config";

/**
 * 오크밸리 콘도 '예약확인'(`c_701.jsp`) → `/mail`의 예약정보.
 *
 * 화면은 콘도 예약 화면(`c_100.jsp`) 안에 `c_701.jsp`를 끼워 넣고, 그 스크립트가
 * `POST /condo.reservation.pns?revSearch_{J|M|C}`에 폼 `data_param_rev_search`를 보낸다.
 * J(지정회원)·M(미지정회원)·C(사이버회원) 중 무엇을 부를지는 사람이 회원권을 고른 뒤 정해지는데,
 * **C(사이버 아이디 기준)가 이 웹 계정으로 잡은 예약 전부를 준다**(실측 25건, 1.2초).
 * 그래서 회원권을 고르지 않고 C를 직접 부른다. 조사 기록은 `docs/crawlers/oakvalley.md`의 "### 예약내역".
 *
 * - 폼에 서버가 넣은 `ptSignature`가 있어 요청을 URL로만 조립할 수 없다 — 재고 크롤러와 같은 이유로
 *   `c_100.jsp`를 한 번 열어 폼 값을 읽는다(DOM을 몰지 않는다).
 * - **읽기 전용.** 변경·취소(`getRevCancel` 등) 콜은 부르지 않는다.
 * - 응답에 예약자·투숙자 연락처와 회원번호가 있다. 읽는 칸만 선언하고 이름은 로그에 남기지 않는다.
 */

const SEARCH_URL = `${OAKVALLEY.rsvBase}/condo.reservation.pns?revSearch_C`;

interface Entity {
  /** 화면의 '예약번호' */
  RES_FOLIO?: string;
  /** 투숙자 */
  RES_NAME?: string;
  /** 예약자 — 법인 계정이면 회사명 */
  RES_CALLER?: string;
  RES_ARR?: string;
  RES_DEP?: string;
  RES_COMPLEX?: string;
  RES_PYNG?: string;
  RES_RMDESC?: string;
  /** 화면의 '요금' */
  RES_RMRATE?: string;
  RES_STATUS?: string;
  RES_TYPE_DESC?: string;
}

/**
 * 단지 코드 → 메일의 객실지역. 사전(`MAIL_RESORTS.oak.regions`)이 "원주 밸리빌리지"로 부르므로
 * 같은 표기를 쓴다. 힐스는 사전에 없어 같은 꼴로 만든다 — 모르는 코드는 크롤러 config의 이름 그대로.
 */
const REGION_BY_COMPLEX: Record<string, string> = {
  "1101": "원주 밸리빌리지",
  "2101": "원주 힐스빌리지",
};

export async function fetchReservations(ctx: CrawlerContext): Promise<FetchedReservation[]> {
  const { page, log } = ctx;

  page.on("dialog", (d) => void d.accept().catch(() => undefined));
  await page.goto(OAKVALLEY.entranceUrl, {
    waitUntil: "domcontentloaded",
    timeout: OAKVALLEY.timeouts.navigation,
  });
  await page.evaluate(
    ({ action, flag }) => {
      const f = document.createElement("form");
      f.method = "POST";
      f.action = action;
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = "condo_flag";
      i.value = flag;
      f.appendChild(i);
      document.body.appendChild(f);
      f.submit();
    },
    { action: OAKVALLEY.condoUrl, flag: OAKVALLEY.condoFlag },
  );
  await page.waitForURL(/c_100\.jsp/, { timeout: OAKVALLEY.timeouts.boot }).catch(() => undefined);

  const form = await page.evaluate(() => {
    const f = document.getElementById("data_param_rev_search") as HTMLFormElement | null;
    const cyber = document.getElementById("CERTIFICATE_IN_CYBER_ID") as HTMLInputElement | null;
    if (!f || !cyber?.value) return null;
    const o: Record<string, string> = {};
    for (const e of [...f.elements]) {
      const n = e.getAttribute("name");
      if (n) o[n] = (e as HTMLInputElement).value ?? "";
    }
    o.IN_CYBER_ID = cyber.value;
    return o;
  });
  if (!form) throw new SessionLostError(`오크밸리 예약확인 폼을 열지 못함. url=${page.url()}`);

  const res = await page.request.post(SEARCH_URL, {
    timeout: OAKVALLEY.timeouts.api,
    // 날짜를 비우면 앞으로의 예약을 준다(화면 기본 조회와 같다).
    form: { ...form, IN_ARR_DATE: "", IN_DEP_DATE: "", IN_FOLIO_NO: "", IN_GUEST_NAME: "" },
  });
  if (!res.ok()) throw new Error(`오크밸리 예약확인 ${res.status()}`);
  const text = await res.text();
  let payload: { success?: boolean; entitys?: Entity[] };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    // 세션이 풀리면 JSON 대신 로그인 화면 HTML이 온다.
    throw new SessionLostError("오크밸리 예약확인 응답이 JSON이 아님");
  }
  if (payload.success === false || !Array.isArray(payload.entitys)) {
    throw new SessionLostError("오크밸리 예약확인 거절 (success=false)");
  }

  const from = todayKstIso();
  const out: FetchedReservation[] = [];
  for (const [i, r] of payload.entitys.entries()) {
    const status = (r.RES_TYPE_DESC ?? "").trim();
    if (/취소/.test(status)) continue;
    const checkin = (r.RES_ARR ?? "").trim();
    const checkout = (r.RES_DEP ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)) continue;
    if (checkout <= checkin || checkin < from) continue;

    const guest = (r.RES_NAME ?? "").trim();
    const isCorp = corporateNameMatcher(r.RES_CALLER);
    const rate = Number(String(r.RES_RMRATE ?? "").replace(/,/g, ""));
    const complex = (r.RES_COMPLEX ?? "").trim();
    const branch = OAKVALLEY.branches.find((b) => b.complexCd === complex)?.value;
    const pyng = (r.RES_PYNG ?? "").trim();
    const desc = (r.RES_RMDESC ?? "").trim();
    out.push({
      key: `${i}`,
      // 예약자(회사)와 같은 이름이면 아직 사용자가 지정되지 않은 예약이다.
      name: guest && !(r.RES_CALLER && isCorp(guest)) ? guest : null,
      resNo: r.RES_FOLIO?.trim() || null,
      checkin,
      checkout,
      price: Number.isFinite(rate) && rate > 0 ? rate : null,
      region: REGION_BY_COMPLEX[complex] ?? branch ?? null,
      // "25평 C25타입" — 화면의 '형' 칸(평형)에 단지 안의 타입 이름을 붙인다.
      roomType: [pyng, desc].filter(Boolean).join(" ") || null,
      status,
    });
  }
  out.sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  log("[oakvalley] reservations fetched", { rows: payload.entitys.length, kept: out.length });
  return out;
}
