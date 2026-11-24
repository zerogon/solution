import { deadlineIso } from "@/lib/business-days";
import { holidayOracle } from "@/lib/holidays-kr";
import { buildBody, type MailSignature } from "@/lib/mail/body";
import { buildEml } from "@/lib/mail/eml";
import { parseReservationText, type ParsedReservation } from "@/lib/mail/parse";
import { MAIL_RESORTS, type MailResortKey } from "@/lib/mail/resorts";

/**
 * 예약확정 메일(`/mail`)의 검증 도구. 네트워크도 키도 쓰지 않는다.
 *
 *   npx tsx scripts/debug-mail.ts golden          # 붙여넣기 파서 + 본문 + .eml 기준 사례
 *   npx tsx scripts/debug-mail.ts parse < 파일     # 복사한 글자를 넣어 무엇이 읽히는지 본다
 *   npx tsx scripts/debug-mail.ts parse hanwha < 파일   # 리조트를 못 알아볼 때 쓸 기본값 지정
 *
 * ⚠️ 아래 표본은 **실제 예약 화면을 복사한 것이 아니다.** 리조트별 화면 구조(라벨 이름,
 * 라벨-값 배치)를 흉내 낸 가짜 값이다. 실제 화면에서 어긋나는 칸이 나오면 그 화면을
 * 복사해 `parse`로 돌려 보고, 개인정보를 가짜 값으로 바꾼 뒤 표본에 추가할 것.
 */

type Case = {
  title: string;
  fallback: MailResortKey;
  text: string;
  want: Partial<ParsedReservation>;
};

const CASES: Case[] = [
  {
    title: "소노 — 라벨 없는 예약내역 + 결제대기 ('까지')",
    fallback: "lotte",
    text: [
      "예약내역",
      "1483 소노캄 경주",
      "2026.12.03 ~ 2026.12.05\t2박",
      "스위트 취사\t객실 1",
      "이용자\t김가나",
      "결제예정금액\t196,000원",
      "2026.11.22 23:59 까지 결제",
    ].join("\n"),
    want: {
      resort: "daemyung",
      resNo: "1483",
      name: "김가나",
      checkin: "2026-12-03",
      checkout: "2026-12-05",
      prepay: "2026-11-22",
      price: 196000,
      region: "경주",
      roomType: "스위트 취사",
    },
  },
  {
    title: "소노 펫 — 펫 표시가 있으면 펫 양식",
    fallback: "daemyung",
    text: ["쏠비치 진도 Pet Friendly", "예약번호\t20991", "이용자\t박다라", "입실일\t2026-12-10", "퇴실일\t2026-12-11", "객실요금\t150,000원"].join("\n"),
    want: { resort: "daemyungPet", resNo: "20991", name: "박다라", region: "진도", checkin: "2026-12-10", checkout: "2026-12-11" },
  },
  {
    title: "롯데 — '성명'(담당자)이 아니라 '대표 투숙자 성명'",
    fallback: "daemyung",
    text: [
      "롯데리조트 예약 상세",
      "예약번호\tR2026120100",
      "성명\t최담당",
      "대표 투숙자 성명\t이마바",
      "예약 지점\t롯데리조트 속초",
      "투숙 객실\t디럭스 더블 오션뷰",
      "체크인\t2026.12.20",
      "체크아웃\t2026.12.22",
      "총 결제금액\t420,000원",
    ].join("\n"),
    want: {
      resort: "lotte",
      resNo: "R2026120100",
      name: "이마바",
      region: "속초",
      roomType: "디럭스 더블 오션뷰",
      checkin: "2026-12-20",
      checkout: "2026-12-22",
      price: 420000,
    },
  },
  {
    title: "켄싱턴 — 라벨이 위, 값이 아래인 표",
    fallback: "daemyung",
    text: [
      "켄싱턴리조트 설악비치",
      "예약번호\t숙박자 성명/연락처\t패키지/객실타입",
      "KR77881\t정사아 / 010-0000-0000\t룸온리 / 패밀리 스위트 오션뷰",
      "입실일\t퇴실일\t객실요금",
      "2026-12-24\t2026-12-26\t310,000원",
    ].join("\n"),
    want: {
      resort: "kensington",
      resNo: "KR77881",
      name: "정사아",
      roomType: "룸온리 / 패밀리 스위트 오션뷰",
      region: "설악비치",
      checkin: "2026-12-24",
      checkout: "2026-12-26",
      price: 310000,
    },
  },
  {
    title: "한화 — '사용자명 / 휴대폰번호', '객실종류 … / 1실'",
    fallback: "daemyung",
    text: [
      "한화리조트 예약내역조회",
      "예약번호\t70012345",
      "사용자명 / 휴대폰번호\t한자차 / 010-0000-0000",
      "투숙장소\t설악 쏘라노",
      "객실종류\t디럭스 패밀리 / 1실",
      "투숙일\t2026.12.30 ~ 2027.01.01",
      "이용요금\t264,000 원",
    ].join("\n"),
    want: {
      resort: "hanwha",
      resNo: "70012345",
      name: "한자차",
      region: "설악 쏘라노",
      roomType: "디럭스 패밀리",
      checkin: "2026-12-30",
      checkout: "2027-01-01",
      price: 264000,
    },
  },
  {
    title: "호반 — '실이용자명', 리조트명 → 지역, 줄로 풀린 화면(div)",
    fallback: "daemyung",
    text: [
      "리솜 포레스트",
      "예약번호",
      "H-556677",
      "실이용자명",
      "오카타",
      "투숙객실",
      "S30 스위트 레이크",
      "입실일",
      "2026년 12월 15일",
      "퇴실일",
      "2026년 12월 16일",
      "객실요금",
      "180,000원",
    ].join("\n"),
    want: {
      resort: "hoban",
      resNo: "H-556677",
      name: "오카타",
      roomType: "S30 스위트 레이크",
      region: "제천",
      checkin: "2026-12-15",
      checkout: "2026-12-16",
      price: 180000,
    },
  },
  {
    title: "오크밸리 — 공통 라벨, 퇴실일 없이 'N박'",
    fallback: "daemyung",
    text: ["오크밸리 예약확인", "예약번호 : OV90817", "예약자명 : 유파하", "객실타입 : 콘도 30평형", "이용일 : 2026.12.07 (1박)", "합계 : 99,000원", "원주 밸리빌리지"].join("\n"),
    want: {
      resort: "oak",
      resNo: "OV90817",
      name: "유파하",
      roomType: "콘도 30평형",
      region: "원주 밸리빌리지",
      checkin: "2026-12-07",
      checkout: "2026-12-08",
      price: 99000,
    },
  },
];

const SIGNATURE: MailSignature = {
  name: "홍길동",
  team: "사내복지기금운영국",
  orgLine: "사내복지기금운영국 / 회사",
  phone: "010-0000-0000",
  address: "서울시",
  email: "sender@example.com",
  website: "www.example.com",
  slogan: "문구",
};

let failed = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

function golden() {
  console.log("## 붙여넣기 파서");
  for (const c of CASES) {
    console.log(`\n${c.title}`);
    const got = parseReservationText(c.text, c.fallback);
    for (const [k, v] of Object.entries(c.want)) check(k, got[k as keyof ParsedReservation], v);
  }

  console.log("\n## 취소 마감일 (business-days 재사용: 달력 D-10, 결과만 휴일 보정)");
  const oracle = holidayOracle([2026], { "2026": { "2026-10-05": "대체공휴일", "2026-10-09": "한글날" } });
  const d = (iso: string) => {
    const r = deadlineIso(iso, 10, oracle);
    return r.ok ? r.iso : r.reason;
  };
  check("10/16(금) → 10/06(화)", d("2026-10-16"), "2026-10-06");
  check("10/15(목) → 10/05 대체공휴일 → 주말 → 10/02(금)", d("2026-10-15"), "2026-10-02");
  check("10/19(월) → 10/09 한글날 → 10/08(목)", d("2026-10-19"), "2026-10-08");
  check("공휴일을 모르는 해는 답하지 않는다", d("2027-03-11"), "uncovered");

  console.log("\n## 본문");
  const base = {
    name: "김가나",
    resNo: "1483",
    checkin: "2026-12-03",
    checkout: "2026-12-05",
    prepay: "2026-11-22",
    price: "196,000",
    region: "경주",
    roomType: "스위트 <취사>",
    cancelIso: "2026-11-23",
    signature: SIGNATURE,
  };
  const sono = buildBody({ ...base, resort: MAIL_RESORTS.daemyung }, { captures: ["cid:a"], fixed: null, logo: null });
  check("제목 줄", sono.includes("[휴양소] 객실 예약 확정 안내 건_대명리조트"), true);
  check("취소일", sono.includes("취소는 11월 23일(월)까지"), true);
  check("박수", sono.includes("2박3일"), true);
  check("입실일", sono.includes("2026.12.03(목)"), true);
  check("선결제 문구", sono.includes("196,000원 (2026.11.22(일)까지 선결제 필수)"), true);
  check("3번 안내(선결제 방법)", sono.includes("3. 선 결제 방법"), true);
  check("사람이 친 값은 이스케이프", sono.includes("스위트 &lt;취사&gt;") && !sono.includes("<취사>"), true);
  check("Outlook용 font 태그", sono.includes('<font color="blue">'), true);
  check("Outlook용 형광펜", sono.includes("mso-highlight:yellow"), true);
  check("빈칸 표시 없음", sono.includes("□□"), false);

  const lotte = buildBody({ ...base, prepay: "", resort: MAIL_RESORTS.lotte }, { captures: [], fixed: null, logo: null });
  check("현장결제 문구", lotte.includes("(현장결제 필수)") && !lotte.includes("3. 선 결제 방법"), true);
  check("캡처 없으면 자리 표시", lotte.includes("[예약 캡처가 여기 들어갑니다]"), true);

  const hoban = buildBody({ ...base, resort: MAIL_RESORTS.hoban }, { captures: ["cid:cap"], fixed: "cid:guide", logo: null });
  check("호반: 회신 문구", hoban.includes("취소요청 메일 회신 부탁드립니다."), true);
  check("호반: 안내 이미지 → 스파 문구 → 캡처", hoban.indexOf("cid:guide") < hoban.indexOf("스파 결제시") && hoban.indexOf("스파 결제시") < hoban.indexOf("cid:cap"), true);

  const pet = buildBody({ ...base, resort: MAIL_RESORTS.daemyungPet }, { captures: ["cid:cap"], fixed: "cid:guide", logo: null });
  check("펫: 캡처 → 안내 이미지 → 펫 문구", pet.indexOf("cid:cap") < pet.indexOf("cid:guide") && pet.indexOf("cid:guide") < pet.indexOf("동반 펫 정보"), true);

  const empty = buildBody(
    { ...base, name: "", cancelIso: null, checkout: "", resort: MAIL_RESORTS.daemyung },
    { captures: [], fixed: null, logo: null },
  );
  check("빈 값은 빈칸 표시", (empty.match(/□□/g) ?? []).length >= 4, true);

  console.log("\n## .eml");
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const eml = buildEml({
    subject: "[휴양소] 제목",
    to: "a@example.com\r\nBcc: x@example.com",
    images: [{ dataUrl: png, name: "capture1.png" }, { dataUrl: png, name: "logo.png" }],
    buildHtml: (cids) => `<img src="${cids[0]}"><img src="${cids[1]}">`,
  });
  check("보내기 전 상태로 열림", eml.startsWith("X-Unsent: 1\r\n"), true);
  check("받는 사람 줄바꿈 제거(헤더 주입 방지)", eml.includes("To: a@example.com Bcc: x@example.com\r\n") && !eml.includes("\r\nBcc:"), true);
  check("이미지 2개가 Content-ID로 실림", (eml.match(/Content-ID: <img\d@resort>/g) ?? []).length, 2);
  const htmlB64 = eml.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
  const html = Buffer.from(htmlB64, "base64").toString("utf8");
  check("본문이 cid를 가리킴", html.includes('src="cid:img1@resort"') && html.includes('src="cid:img2@resort"'), true);
  check("한 줄 76자 이하", eml.split("\r\n").every((l) => l.length <= 76 || l.startsWith("Content-") || l.startsWith("Subject")), true);

  console.log(failed ? `\n${failed}건 실패` : "\n전부 통과");
  process.exit(failed ? 1 : 0);
}

async function parseStdin(fallback: MailResortKey) {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  console.log(JSON.stringify(parseReservationText(text, fallback), null, 2));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "golden") golden();
else if (cmd === "parse") void parseStdin(arg && arg in MAIL_RESORTS ? (arg as MailResortKey) : "daemyung");
else {
  console.log("usage: npx tsx scripts/debug-mail.ts golden | parse [resort] < file");
  process.exit(1);
}
