import { addDaysIso } from "@/lib/utils";
import { MAIL_RESORTS, type MailResortKey } from "./resorts";

/**
 * 리조트 예약 화면에서 **복사한 글자** → 예약정보.
 *
 * 예전에는 캡처 이미지를 OCR로 읽었다. 화면의 글자를 그대로 복사해 오면 오인식이
 * 구조적으로 없으므로, 여기 남는 일은 "어느 칸이 어느 값인가"뿐이다.
 *
 * 브라우저가 표를 복사하면 `text/plain`에서 칸은 탭, 줄은 개행으로 온다. 그래서 한 줄을
 * 칸 배열로 쪼개 두고(`toRows`), 라벨을 찾으면 **같은 칸의 뒤 → 오른쪽 칸 → 아랫줄 같은
 * 칸 → 아랫줄 전체** 순서로 값을 찾는다. div로 짠 화면은 칸이 줄로 풀려 오므로 마지막
 * 후보가 그 경우를 받는다.
 *
 * DOM을 쓰지 않는 순수 함수다 — `scripts/debug-mail.ts`가 같은 함수를 돌려 검증한다.
 */

export interface ParsedReservation {
  resort: MailResortKey | null;
  name: string | null;
  resNo: string | null;
  /** "YYYY-MM-DD" */
  checkin: string | null;
  checkout: string | null;
  prepay: string | null;
  price: number | null;
  region: string | null;
  roomType: string | null;
}

const LABELS = {
  name: ["예약자명", "예약자", "투숙자명", "투숙자", "이용자명", "이용자", "고객명", "성명", "회원명", "이름"],
  resNo: ["예약번호", "예약 번호", "예약코드", "예약확인번호", "확인번호", "Confirmation", "Reservation No"],
  roomType: ["객실타입", "객실유형", "객실형태", "객실명", "객실종류", "룸타입", "객실정보", "객실 타입", "타입", "객실"],
  region: ["사업장", "영업장", "리조트명", "지점", "지역", "호텔명", "콘도명", "이용시설", "시설"],
  price: ["총결제금액", "상품금액", "총 결제금액", "결제금액", "결제예정금액", "총금액", "총요금", "객실요금", "이용요금", "판매가", "합계", "금액", "요금"],
  checkin: ["입실일", "입실", "체크인", "도착일", "이용시작", "투숙일", "이용일", "숙박일"],
  checkout: ["퇴실일", "퇴실", "체크아웃", "출발일", "이용종료"],
  prepay: ["결제기한", "결제 기한", "입금기한", "결제마감", "결제만료", "결제유효", "결제기간"],
} as const;

/** 라벨 글자 사이의 공백을 허용한다 ("예약 번호" = "예약번호"). */
function loose(label: string): RegExp {
  const src = [...label]
    .map((c) => (c === " " ? "\\s*" : `${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`))
    .join("");
  return new RegExp(src, "i");
}

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_SRC = "(20\\d{2})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})";

/** 문자열 안의 날짜를 나온 순서대로. 월 1~12, 일 1~31만 인정한다. */
function datesIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(new RegExp(DATE_SRC, "g"))) {
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(`${m[1]}-${pad(mo)}-${pad(d)}`);
  }
  return out;
}

type Row = string[];

/** 줄 → 칸 배열. 탭·세로줄·공백 2칸 이상이 칸 경계다. 빈 칸은 자리를 지키도록 남긴다. */
function toRows(raw: string): Row[] {
  return raw
    .replace(/\r/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.split(/\t|[|｜]| {2,}/).map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean));
}

const firstCol = (s: string) => s.split(/\t| {2,}/)[0] ?? "";

/** 라벨(공통 + 리조트별) 중 하나로 시작하는 칸 — 값이 아니라 옆 칸의 제목이다. */
const ALL_LABELS = [
  ...Object.values(LABELS).flat(),
  ...Object.values(MAIL_RESORTS).flatMap((r) => Object.values(r.labels ?? {}).flat()),
].map(loose);
const isLabelCell = (cell: string) => ALL_LABELS.some((re) => cell.search(re) === 0);

function findLabeled<T>(
  rows: Row[],
  labels: readonly string[],
  test: (candidate: string) => T | null | undefined | false | "",
): T | null {
  for (const label of labels) {
    const re = loose(label);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      for (let j = 0; j < row.length; j += 1) {
        const m = row[j].match(re);
        if (!m || m.index === undefined) continue;
        // 라벨 뒤 괄호는 제목의 일부다 ("객실요금(원)").
        const after = row[j]
          .slice(m.index + m[0].length)
          .replace(/^\s*\([^)]*\)/, "")
          .replace(/^[\s:：·\-_]+/, "");
        const next = rows[i + 1] ?? [];
        // 같은 칸에 글자가 더 있으면 그 칸이 "라벨: 값"이다 — 옆 칸·아랫줄까지 가면
        // '객실 1' 같은 칸이 엉뚱한 이웃을 값으로 물어 온다.
        const candidates = after
          ? [after]
          : [
              row.slice(j + 1).find((c) => c && !isLabelCell(c)) ?? "",
              next.length > 1 ? (next[j] ?? "") : "",
              next.join("  "),
            ];
        for (const cand of candidates) {
          const v = test(cand.trim());
          if (v) return v;
        }
      }
    }
  }
  return null;
}

/** 객실 이름에 흔히 들어가는 단어 — 라벨이 없는 화면에서 객실타입 칸을 고를 때 쓴다. */
const ROOM_WORDS =
  /스위트|디럭스|패밀리|스탠다드|노블|로얄|프리미어|더블|싱글|트윈|온돌|침대|취사|오션뷰|레이크|마운틴|가든뷰|평형|빌라|콘도|pet\s*friendly/i;

/**
 * @param fallbackResort 글자에서 리조트를 알아보지 못했을 때 쓸 리조트(지금 화면에서 고른 것).
 *   리조트별 라벨·지역 사전이 여기에 걸려 있다.
 */
export function parseReservationText(
  raw: string,
  fallbackResort: MailResortKey,
): ParsedReservation {
  const rows = toRows(raw);
  const text = rows.map((r) => r.join("  ")).join("\n");
  const compact = text.replace(/\s+/g, "").toLowerCase();
  const has = (w: string) => compact.includes(w.replace(/\s/g, "").toLowerCase());

  // 리조트
  let resort: MailResortKey | null = null;
  let bestScore = 0;
  for (const [key, r] of Object.entries(MAIL_RESORTS) as [MailResortKey, (typeof MAIL_RESORTS)[MailResortKey]][]) {
    let score = r.keywords.filter(has).length;
    if (key === "daemyungPet" && score) score += 2; // 펫 표시가 있으면 펫 우선
    if (score > bestScore) {
      bestScore = score;
      resort = key;
    }
  }
  // '펫'이라는 글자만으로는 소노가 아니다.
  if (resort === "daemyungPet" && !/소노|대명|sono|쏠비치/i.test(compact)) resort = null;

  const rkey = resort ?? fallbackResort;
  const cfg = MAIL_RESORTS[rkey];
  const labelsOf = (k: "name" | "roomType" | "region") => cfg.labels?.[k] ?? LABELS[k];

  // 예약번호
  let resNo = findLabeled(rows, LABELS.resNo, (s) => s.match(/[A-Z0-9][A-Z0-9-]{3,}/i)?.[0]);
  if (!resNo) {
    // 라벨이 없는 화면 (소노 예약내역 '1483 소노캄 경주'): 줄 맨 앞의 숫자.
    // 회원번호 줄('11725700 | 본인(정회원/가족회원)')과 날짜·금액·인원 줄은 뺀다.
    for (const row of rows) {
      const c = row[0];
      if (/본인|회원|대인|소인|객실\s*\d|원\b|박|total/i.test(c) || datesIn(c).length) continue;
      const m = c.match(/^(\d{3,12})(?=\s|$)/);
      if (m) {
        resNo = m[1];
        break;
      }
    }
  }

  // 예약자명 — 소노는 '이용자' 값이 예약자명이다.
  const nameLabels = rkey.startsWith("daemyung") ? ["이용자", ...LABELS.name] : labelsOf("name");
  const name = findLabeled(rows, nameLabels, (s) => {
    const c = firstCol(s).replace(/\s+/g, "");
    const m = c.match(/^[가-힣]{2,12}(?:\(주\)|㈜)/) ?? c.match(/^[가-힣]{2,5}/);
    if (!m || /^(님|고객|회원|정보)/.test(m[0])) return null;
    return m[0].replace(/(?<=[가-힣]{2})님$/, "");
  });

  // 날짜
  const range = rows
    .map((r) => datesIn(r.join("  ")))
    .find((ds) => ds.length >= 2 && ds[1] > ds[0]);
  const ci = findLabeled(rows, LABELS.checkin, (s) => datesIn(s)[0]);
  const co = findLabeled(rows, LABELS.checkout, (s) => datesIn(s)[0]);
  let checkin = ci ?? range?.[0] ?? null;
  let checkout = co && (!checkin || co > checkin) ? co : (range?.[1] ?? null);
  if (checkin && !checkout) {
    const nights = text.match(/(\d{1,2})\s*박/)?.[1];
    if (nights) checkout = addDaysIso(checkin, Number(nights));
  }
  if (!checkin) {
    // 라벨도 범위도 없으면 가장 늦은 두 날짜 (앞쪽은 예약일·결제일인 경우가 많다).
    const all = [...new Set(datesIn(text))].sort();
    if (all.length >= 2) {
      checkin = all[all.length - 2];
      checkout = all[all.length - 1];
    }
  }

  // 선결제 기한 — 라벨이 없으면 '2026.11.22 23:59 까지'처럼 날짜 뒤에 '까지'가 붙은 칸.
  let prepay = findLabeled(rows, LABELS.prepay, (s) => datesIn(s)[0]);
  if (!prepay) {
    const m = text.match(new RegExp(`${DATE_SRC}[\\s\\d:]*까\\s*지`));
    if (m) prepay = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  }

  // 금액
  const money = (s: string) => {
    const m = s.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  let price = findLabeled(rows, LABELS.price, (s) => {
    const v = money(s);
    return v && v >= 10000 ? v : null;
  });
  if (!price) {
    const all = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)\s*원/g)].map((m) => Number(m[1].replace(/,/g, "")));
    if (all.length) price = Math.max(...all);
  }

  // 객실타입
  let roomType = findLabeled(rows, labelsOf("roomType"), (s) => {
    const v = firstCol(s)
      .replace(/(\d+\s*박.*|\d+\s*실.*|\d{1,3}(,\d{3})+\s*원.*)$/, "")
      .replace(/\s*\/\s*\d+\S{0,2}$/, "") // '/ 1실'
      .replace(/[\s/]+$/, "")
      .trim();
    const ok =
      v.length >= 2 &&
      !/^\d+$/.test(v) &&
      !/^(요금|수|정보|번호|료|인원|금액)/.test(v) &&
      datesIn(v).length === 0;
    return ok ? v : null;
  });
  if (!roomType) {
    roomType =
      rows
        .flat()
        .find((c) => ROOM_WORDS.test(c) && !datesIn(c).length && !/대인|소인|객실\s*\d|원$/.test(c)) ??
      null;
  }

  // 객실지역 — 리조트별 사전 우선.
  let region: string | null = null;
  if (cfg.name === "대명리조트") {
    // '소노문 해운대', '소노캄 경주', '쏠비치 진도' → 브랜드 뒤 지명
    const m = text.match(/(?:소노\s*[캄벨문휴]|소노\s*펠리체|쏠\s*비\s*치|델피노|쏠레어)\s*([가-힣]{2,5})/);
    if (m && !/리조트|호텔|예약|결제/.test(m[1])) region = m[1];
  }
  region = region ?? cfg.regions.find(has) ?? null;
  if (cfg.regionMap) {
    const hit = Object.keys(cfg.regionMap).find((k) => compact.includes(k));
    if (hit) region = cfg.regionMap[hit];
  }
  region = region ?? findLabeled(rows, labelsOf("region"), (s) => (s.length >= 2 ? firstCol(s) : null));

  return { resort, name, resNo, checkin, checkout, prepay, price, region, roomType };
}
