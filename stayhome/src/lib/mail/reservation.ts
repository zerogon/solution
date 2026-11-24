import type { MailResortKey } from "./resorts";

/**
 * 리조트 예약내역에서 직접 가져온 예약 한 건 — `/mail`의 "예약 불러오기".
 *
 * 붙여넣기 파서(`parse.ts`의 `ParsedReservation`)와 같은 칸을 같은 형식으로 갖는다. 그래야
 * 화면이 두 출처를 같은 방식으로 칸에 채운다. 다른 점은 출처가 **사이트의 데이터**라는 것뿐이다.
 *
 * ⚠️ 이 값에는 구성원 이름이 들어 있다. 서버는 저장하지도 로그에 남기지도 않고,
 * 클라이언트는 화면 상태로만 들고 있다(`/api/mail/*`는 서비스워커 캐시도 우회한다).
 * 사이트의 내부 예약번호·연락처·회원번호처럼 메일에 안 쓰는 값은 **응답에 싣지 않는다.**
 */
export interface FetchedReservation {
  /** 목록 안에서만 유효한 키 (화면의 React key). 사이트의 번호가 아니다. */
  key: string;
  /**
   * 사용자(투숙자) 이름. 법인 이름으로 잡혀 있는 예약은 null이다 — 한화·리솜 모두 객실을
   * 법인 명의로 먼저 잡아 두고 나중에 사용자를 바꾸는데, 그 전까지는 이름 칸에 회사명이 있다.
   * 그 값을 메일의 예약자명으로 넣으면 안 된다.
   */
  name: string | null;
  /** 화면의 '예약번호' (한화·리솜·소노 4자리, 롯데·오크밸리는 사이트 표기 그대로). */
  resNo: string | null;
  /** "YYYY-MM-DD" */
  checkin: string;
  checkout: string;
  price: number | null;
  region: string | null;
  roomType: string | null;
  /** 사이트가 붙인 상태 이름 ("확정예약" 등). */
  status: string;
}

export interface FetchReservationsResponse {
  reservations: FetchedReservation[];
  /** ISO 시각 */
  fetchedAt: string;
}

/**
 * 불러오기를 지원하는 메일 리조트 → 크롤러 슬러그. 나머지는 붙여넣기로 채운다.
 * 값은 문자열 리터럴이다 — 이 파일은 클라이언트 번들에 실리므로 Prisma enum을 import하지 않는다.
 */
export type FetchableSlug = "HANWHA" | "RESOM" | "SONO" | "LOTTE" | "OAKVALLEY" | "KENSINGTON";

export const FETCHABLE_RESORTS: Partial<Record<MailResortKey, FetchableSlug>> = {
  hanwha: "HANWHA",
  hoban: "RESOM",
  // 일반·펫은 메일 양식만 다르고 같은 계정·같은 예약 목록이다.
  daemyung: "SONO",
  daemyungPet: "SONO",
  lotte: "LOTTE",
  oak: "OAKVALLEY",
  kensington: "KENSINGTON",
};

export const canFetchReservations = (key: MailResortKey) => key in FETCHABLE_RESORTS;

/**
 * 이름을 넣어야 불러올 수 있는 리조트. 목록 전체를 넘기면 예산을 넘는 곳이라 사이트의 이름 검색으로
 * 좁힌다(롯데: 목록 한 페이지 5~10초). 나머지는 전체 목록을 받아 화면에서 이름으로 거른다.
 */
const NAME_REQUIRED: ReadonlySet<MailResortKey> = new Set(["lotte"]);
export const needsNameToFetch = (key: MailResortKey) => NAME_REQUIRED.has(key);

/** 이름 검색어로 받는 최대 길이. 사이트 검색칸에 그대로 실리므로 짧게 자른다. */
export const NAME_QUERY_MAX = 20;
