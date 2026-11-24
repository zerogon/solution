import { addDaysIso, todayKstIso } from "@/lib/utils";
import { MAIL_RESORTS } from "@/lib/mail/resorts";
import type { FetchedReservation } from "@/lib/mail/reservation";
import type { CrawlerContext } from "../types";
import { SessionLostError } from "../_shared/errors";
import { HANWHA } from "./config";
import { bootSession } from "./search";

/**
 * 한화 예약내역(예약확인/변경/취소) → `/mail`의 예약정보.
 *
 * 화면(`msi/0010/serviceM01.mvc`)은 조회 버튼을 누르면 게이트웨이에
 * `INTF_ID=TFO00HBSREMPRR0122`를 보낸다. 그 요청을 그대로 재현한다 — 도착일 범위 +
 * `CUST_NO` + 페이지. 조사 기록은 `docs/crawlers/hanwha.md`의 "### 예약내역".
 *
 * - 화면은 조회 전에 회원 비밀번호 팝업(`serviceP13`)을 띄우지만 **서버는 그것을 요구하지
 *   않는다**(2026-11-24 실측: 팝업 없이 바로 20행). 팝업은 화면의 관문일 뿐이다.
 * - **읽기 전용.** 같은 화면의 변경·취소·분할 서비스(REMPRR2018 등)는 부르지 않는다.
 * - 응답에는 연락처·회원번호·내부 예약번호가 있다. 메일에 안 쓰는 값은 **여기서 버린다** —
 *   라우트 밖으로 나가는 것은 `FetchedReservation`의 칸뿐이고, 이름은 로그에 남기지 않는다.
 */

const LIST_SERVICE = { INTF_ID: "TFO00HBSREMPRR0122", RECV_SVC_CD: "HBSREMPRR0122" } as const;
const PAGE_SIZE = 100;
/** 한 번에 앞으로 1년. 법인 예약이 수백 건이 되는 일은 없지만 무한 루프는 막는다. */
const MAX_PAGES = 5;
const SPAN_DAYS = 365;

/** 응답에서 읽는 칸만. 나머지(연락처·회원번호 등)는 선언하지 않는다. */
interface ListRow {
  RSRV_IDNT_NO?: string;
  INHS_CUST_NM?: string;
  /** 회원사(법인) 이름. 사용자가 지정되지 않은 예약은 `INHS_CUST_NM`이 이것과 같다. */
  CUST_NM?: string;
  ARRV_DATE?: string;
  OVNT_CNT?: string | number;
  LOC_ALIAS?: string;
  BRCH_NM?: string;
  ROOM_INFO?: string;
  ROOM_RATE_SM?: string | number;
  ADI_SVC_AMT?: string | number;
  LPAY_AMT_SM?: string | number;
  ROOM_RATE_EXPSR_YN?: string;
  NEGO_GOODS_YN?: string;
  CPON_SPECL_INFO?: string;
  ROOM_RSRV_STAT_NM?: string;
}

interface ListPayload {
  ds?: {
    Data?: {
      ds_result?: ListRow[];
      ds_page?: { END_PAGE_YN?: string; TOTAL_CNT?: string }[];
    };
    MessageHeader?: { MSG_TXT?: string };
  };
}

const compact = (iso: string) => iso.replace(/-/g, "");
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function fetchReservations(ctx: CrawlerContext): Promise<FetchedReservation[]> {
  const { page, log } = ctx;
  const session = await bootSession(ctx);
  const from = todayKstIso();
  const to = addDaysIso(from, SPAN_DAYS);

  const rows: ListRow[] = [];
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const ds = {
      ds_search: [
        {
          CORP_CD: HANWHA.request.CORP_CD,
          BRCH_CD: "",
          LOC_CD: "",
          ARRV_DATE_STRT: compact(from),
          ARRV_DATE_END: compact(to),
          RSRV_NO: "",
          RSRV_IDNT_NO: "",
          RSRV_MTH_CD: "",
          CUST_NO: session.custNo,
          // 화면의 '회원 구분' 기본값. 이 계정에서 회원(01) 하나뿐이다.
          MEMB_DIV_CD: "01",
          MEMB_MAST_NO: "",
          CONT_NO: "",
          MEMB_NO: "",
          // 1 = 도착일 오름차순 (화면 기본값, 실측으로 정렬 확인)
          SORT_ORDR: "1",
          RSRV_CUST_NM: "",
          RSRV_CUST_TEL_NO: "",
          CI_CNFM_CD: "",
          CYBER_ID: "",
          INHS_CUST_NM: "",
          SCH_AUTH_KEY: "",
        },
      ],
      ds_page: [{ CURRENT_PAGE: String(pageNo), CNT_PER_PAGE: String(PAGE_SIZE) }],
      serviceInfo: LIST_SERVICE,
    };

    const res = await page.request.post(HANWHA.calendarUrl, {
      timeout: HANWHA.timeouts.api,
      headers: { Referer: HANWHA.entranceUrl },
      form: { ds: JSON.stringify(ds) },
    });
    if (!res.ok()) throw new Error(`예약내역 조회 ${res.status()}`);
    const payload = (await res.json()) as ListPayload;
    const data = payload.ds?.Data;
    // 서비스 오류는 200 안의 봉투로 온다. `ds_result`가 아예 없으면 빈 목록이 아니라 거절이다.
    if (!data || !("ds_result" in data)) {
      const msg = payload.ds?.MessageHeader?.MSG_TXT ?? "ds_result 없음";
      // 세션이 풀리면 이 게이트웨이는 회원을 모르는 채로 거절한다.
      throw new SessionLostError(`예약내역 조회 거절: ${msg}`);
    }
    const batch = data.ds_result ?? [];
    rows.push(...batch);
    if (data.ds_page?.[0]?.END_PAGE_YN === "Y" || batch.length < PAGE_SIZE) break;
  }

  const out: FetchedReservation[] = [];
  for (const [i, r] of rows.entries()) {
    const reservation = toReservation(r, i);
    if (reservation) out.push(reservation);
  }
  log("[hanwha] reservations fetched", { rows: rows.length, kept: out.length });
  return out;
}

function toReservation(r: ListRow, i: number): FetchedReservation | null {
  const status = (r.ROOM_RSRV_STAT_NM ?? "").trim();
  if (/취소/.test(status)) return null;

  const m = (r.ARRV_DATE ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  const nights = num(r.OVNT_CNT);
  if (!m || nights < 1) return null;
  const checkin = `${m[1]}-${m[2]}-${m[3]}`;

  const guest = (r.INHS_CUST_NM ?? "").trim();
  const corporate = !guest || guest === (r.CUST_NM ?? "").trim();

  return {
    key: `${i}`,
    name: corporate ? null : guest,
    resNo: r.RSRV_IDNT_NO?.trim() || null,
    checkin,
    checkout: addDaysIso(checkin, nights),
    price: priceOf(r),
    region: regionOf(r),
    roomType: roomTypeOf(r),
    status,
  };
}

/**
 * 화면의 '요금' 칸과 같은 값. 화면 스크립트가 고르는 규칙을 그대로 옮겼다 —
 * 요금 비공개 예약은 금액을 그리지 않고, 특가·제휴 쿠폰 예약은 실결제액(`LPAY_AMT_SM`)을,
 * 나머지는 객실요금 + 부가서비스를 그린다.
 */
function priceOf(r: ListRow): number | null {
  if (r.ROOM_RATE_EXPSR_YN === "N") return null;
  const special =
    r.NEGO_GOODS_YN === "Y" || ["ASIANA", "FDTK", "MAYDY"].includes(r.CPON_SPECL_INFO ?? "");
  const v = (special ? num(r.LPAY_AMT_SM) : num(r.ROOM_RATE_SM)) + num(r.ADI_SVC_AMT);
  return v > 0 ? v : null;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * 메일의 객실지역 사전(`MAIL_RESORTS.hanwha.regions`)에 있는 이름으로. 사이트의
 * `LOC_ALIAS`("설악 쏘라노"·"거제 벨버디어"·"해운대")가 사전과 거의 그대로 맞는다.
 * 사전에 없으면 사이트가 부르는 이름을 그대로 쓴다 — 추측해서 다른 이름으로 바꾸지 않는다.
 */
function regionOf(r: ListRow): string | null {
  const alias = (r.LOC_ALIAS ?? r.BRCH_NM ?? "").trim();
  if (!alias) return null;
  const regions = MAIL_RESORTS.hanwha.regions;
  return (
    regions.find((x) => squash(x) === squash(alias)) ??
    regions.find((x) => squash(alias).includes(squash(x))) ??
    alias
  );
}

/**
 * `ROOM_INFO`는 `"설악 쏘라노 / 디럭스(모던) / 1실"` 꼴이다. 첫 조각은 지점(= `LOC_ALIAS`,
 * 실측 20/20 일치)이라 객실지역 칸과 겹치고, 끝 조각은 객실 수다. 가운데만 객실타입이다.
 */
function roomTypeOf(r: ListRow): string | null {
  const parts = (r.ROOM_INFO ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length && /^\d+\s*실$/.test(parts[parts.length - 1])) parts.pop();
  if (parts.length > 1 && squash(parts[0]) === squash(r.LOC_ALIAS ?? "")) parts.shift();
  return parts.join(" / ") || null;
}
