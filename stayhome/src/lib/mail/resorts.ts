/**
 * 예약확정 메일의 리조트별 설정.
 *
 * 크롤러의 `ResortSlug`와 **다른 축**이다 — 여기 키는 "메일 양식이 갈리는 단위"라서
 * 크롤러가 없는 켄싱턴이 들어 있고, 소노는 일반/펫 둘로 나뉜다. 크롤러 config를
 * import하지 않으므로 클라이언트 번들에 실려도 된다.
 */

export type MailResortKey =
  | "daemyung"
  | "daemyungPet"
  | "lotte"
  | "oak"
  | "kensington"
  | "hanwha"
  | "hoban";

export interface MailResort {
  /** 메일 제목·표에 들어가는 이름. */
  name: string;
  /** 선택 목록에 보이는 이름. */
  label: string;
  /** 선결제 리조트 — 3번 안내와 "까지 선결제 필수"가 붙는다. 아니면 "현장결제 필수". */
  prepay?: boolean;
  /** 1번 항목 끝 문구. 기본 "연락 부탁드립니다". */
  contact?: string;
  /** 표 아래 추가 안내 (HTML, 고정 문구라 이스케이프하지 않는다). */
  extraAfterTable?: string;
  /** 고정 안내 이미지·추가 문구를 캡처보다 먼저 넣는다 (호반의 기존 메일 순서). */
  guideFirst?: boolean;
  /** 붙여넣은 글자에서 리조트를 알아보는 단어. */
  keywords: string[];
  /** 이 리조트에만 있는 라벨. 있으면 공통 라벨 대신 이것만 쓴다 (다른 '성명' 칸을 잘못 잡지 않도록). */
  labels?: Partial<Record<"name" | "roomType" | "region", string[]>>;
  /** 객실지역 사전. 앞에 있는 것이 우선이라 긴 이름을 먼저 둔다. */
  regions: string[];
  /** 화면의 단어 → 객실지역 (호반: 리조트명이 지역을 뜻한다). */
  regionMap?: Record<string, string>;
}

const P0 = '<p style="margin:0">';
const BLANK_P = `${P0}&nbsp;</p>`;

export const MAIL_RESORTS: Record<MailResortKey, MailResort> = {
  daemyung: {
    name: "대명리조트",
    label: "대명리조트 (소노)",
    prepay: true,
    keywords: ["소노", "대명", "sono", "비발디", "쏠비치"],
    regions: [
      "비발디파크", "쏠비치 양양", "쏠비치 삼척", "쏠비치 진도", "쏠비치 남해",
      "소노벨 청송", "소노벨 경주", "소노벨 변산", "소노벨 천안", "소노벨 제주",
      "소노캄 거제", "소노캄 여수", "소노캄 제주", "소노캄 고양", "소노문 단양",
      "소노펠리체", "양평", "홍천", "변산", "경주", "청송", "단양", "거제", "여수",
      "천안", "제주", "진도", "양양", "삼척", "남해",
    ],
  },
  daemyungPet: {
    name: "대명리조트",
    label: "대명리조트 (펫)",
    prepay: true,
    keywords: ["pet", "펫", "반려"],
    regions: [
      "진도", "비발디파크", "양양", "삼척", "변산", "경주", "청송", "단양", "거제",
      "여수", "천안", "제주", "홍천", "양평", "남해",
    ],
    extraAfterTable:
      `${P0}<b><span style="color:red">*동반 펫 정보 등록 방법*</span></b></p>` +
      `${P0}<b><span style="color:red">알림톡 결제대기 페이지 → 예약변경</span></b></p>${BLANK_P}`,
  },
  lotte: {
    name: "롯데리조트",
    label: "롯데리조트",
    keywords: ["롯데", "lotte"],
    // '성명'은 예약한 담당자다. '대표 투숙자 성명'이 예약자명.
    labels: {
      name: ["대표 투숙자 성명", "대표투숙자", "투숙자 성명"],
      roomType: ["투숙 객실", "투숙객실"],
      region: ["예약 지점"],
    },
    regions: ["속초", "부여", "제주 아트빌라스", "제주", "김해"],
  },
  oak: {
    name: "오크밸리",
    label: "오크밸리",
    keywords: ["오크밸리", "oak", "밸리빌리지"],
    regions: ["원주 밸리빌리지", "밸리빌리지", "원주"],
  },
  kensington: {
    name: "켄싱턴리조트",
    label: "켄싱턴리조트",
    keywords: ["켄싱턴", "kensington", "이랜드"],
    // '숙박자 성명/연락처' 아래 이름이 예약자명, '패키지/객실타입' 값 전체가 객실타입.
    labels: {
      name: ["숙박자 성명/연락처", "숙박자 성명", "숙박자"],
      roomType: ["패키지/객실타입", "객실타입", "패키지/객실"],
    },
    regions: [
      "제주한림", "설악비치", "설악밸리", "설악", "경주", "지리산남원", "지리산하동",
      "충주", "가평", "서귀포", "양양", "여수", "강화", "평창", "청평", "해운대",
    ],
  },
  hanwha: {
    name: "한화리조트",
    label: "한화리조트",
    keywords: ["한화", "hanwha", "쏘라노", "sorano", "벨버디어"],
    // '사용자명 / 휴대폰번호' 칸의 이름이 예약자명, '객실종류'가 객실타입 ('/ 1실'은 뗀다).
    labels: {
      name: ["사용자명 / 휴대폰번호", "사용자명"],
      roomType: ["객실종류"],
      region: ["투숙장소"],
    },
    regions: [
      "설악 쏘라노", "설악 별관", "대천 파로스", "산정호수 안시", "용인 베잔송", "양평",
      "평창", "경주", "제주", "해운대", "여수 벨메르", "거제 벨버디어", "지리산", "백암",
      "수안보", "대천", "용인", "여수", "거제", "설악",
    ],
  },
  hoban: {
    name: "호반리조트",
    label: "호반리조트",
    keywords: ["호반", "리솜", "resom", "hoban", "레스트리", "스플라스"],
    contact: "취소요청 메일 회신 부탁드립니다",
    guideFirst: true,
    // '실이용자명'이 예약자명, '투숙객실' 전체가 객실타입, 리조트명이 지역.
    labels: { name: ["실이용자명", "실이용자"], roomType: ["투숙객실"] },
    regionMap: { 포레스트: "제천", 레스트리: "제천", 스플라스: "덕산", 아일랜드: "안면도" },
    extraAfterTable:
      `${P0}<b><span style="color:blue">스파 결제시 SK쉴더스 직원임을 말씀해 주시면 할인율이 적용됩니다. (사원증 및 사번 불필요)</span></b></p>${BLANK_P}`,
    regions: ["제천", "덕산", "안면도", "포레스트", "스플라스", "아일랜드"],
  },
};

export const MAIL_RESORT_KEYS = Object.keys(MAIL_RESORTS) as MailResortKey[];

export function isMailResortKey(v: unknown): v is MailResortKey {
  return typeof v === "string" && v in MAIL_RESORTS;
}
