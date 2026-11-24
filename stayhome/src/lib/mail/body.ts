import { parseDate } from "@/lib/utils";
import type { MailResort } from "./resorts";

/**
 * 예약확정 메일 본문(HTML). 받는 쪽이 Outlook(Word 엔진)이라 전부 인라인 스타일이고,
 * 미리보기·본문 복사·.eml이 **같은 문자열**을 쓴다 — 이미지 src만 다르다(data URL / cid).
 */

const WD = ["일", "월", "화", "수", "목", "금", "토"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-22" → "2026.11.22(일)" */
export function fmtDot(iso: string): string {
  const d = parseDate(iso);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}(${WD[d.getUTCDay()]})`;
}

/** "2026-11-22" → "11월 22일(일)" */
export function fmtMd(iso: string): string {
  const d = parseDate(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WD[d.getUTCDay()]})`;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** 보내는 사람 서명. 개인 연락처가 들어가므로 소스에 두지 않고 브라우저에 저장한다. */
export interface MailSignature {
  /** 이름 */
  name: string;
  /** 인사말의 소속 ("○○입니다" 앞) */
  team: string;
  /** 서명의 소속 줄 */
  orgLine: string;
  phone: string;
  address: string;
  email: string;
  website: string;
  slogan: string;
}

export interface MailData {
  resort: MailResort;
  name: string;
  resNo: string;
  /** "YYYY-MM-DD" 또는 빈 값 */
  checkin: string;
  checkout: string;
  prepay: string;
  /** "196,000" 처럼 표시용으로 만든 값 */
  price: string;
  region: string;
  roomType: string;
  /** 취소 마감일. 계산하지 못했으면 null → 메일에 빈칸 표시가 남는다. */
  cancelIso: string | null;
  signature: MailSignature;
}

export interface MailImages {
  captures: string[];
  fixed: string | null;
  logo: string | null;
}

export const subjectOf = (resort: MailResort) => `[휴양소] 객실 예약 확정 안내 건_${resort.name}`;

/** 비어 있는 값 자리. 미리보기에서 눈에 띄도록 칠한다. */
const BLANK = '<span style="background:#ffe08a">□□</span>';
const val = (s: string) => (s ? esc(s) : BLANK);

export function nightsOf(checkin: string, checkout: string): number | null {
  if (!checkin || !checkout) return null;
  return Math.round((parseDate(checkout).getTime() - parseDate(checkin).getTime()) / 86_400_000);
}

export function buildBody(d: MailData, img: MailImages): string {
  const F = "font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;";
  const P = `margin:0;${F}`;
  const th = `border:1px solid #000;background:#F7CAAC;padding:2px 7px;text-align:center;font-weight:bold;${F}`;
  const th2 = `border:1px solid #000;background:#FBE4D5;padding:2px 7px;text-align:center;font-weight:bold;${F}`;
  const td = `border:1px solid #000;padding:2px 7px;${F}`;
  const tdB = `border:1px solid #000;padding:2px 7px;text-align:center;font-weight:bold;color:blue;${F}`;
  const G = `color:#696B75;${F}`;

  const r = d.resort;
  const s = d.signature;
  const cancelTxt = d.cancelIso ? fmtMd(d.cancelIso) : BLANK;
  const contact = r.contact ?? "연락 부탁드립니다";
  const priceNote = r.prepay
    ? `(${d.prepay ? fmtDot(d.prepay) : BLANK}까지 선결제 필수)`
    : "(현장결제 필수)";
  const nights = nightsOf(d.checkin, d.checkout);
  const nightsTxt = nights && nights > 0 ? `${nights}박${nights + 1}일` : BLANK;
  const blue = (inner: string) => `<b><span style="color:blue">${inner}</span></b>`;

  let h = `<div style="${F}">
<p style="${P}">${esc(subjectOf(r))}</p>
<p style="${P}">안녕하세요</p>
<p style="${P}">${esc(s.team)} ${val(s.name)}입니다.</p>
<p style="${P}">&nbsp;</p>
<p style="${P}">신청하신 휴양소와 관련하여 객실 예약 확정 안내 드립니다.</p>
<p style="${P}">&nbsp;</p>
<p style="${P}margin-left:22pt"><b>[휴양소 예약 및 이용안내]</b></p>
<p style="${P}margin-top:5pt;margin-left:21pt"><b>1.&nbsp;&nbsp; </b>객실 취소는 입실일 기준 10일 전이므로<b> <span style="background:yellow">취소는 ${cancelTxt}까지</span> </b>${contact}.</p>
<p style="${P}margin-top:5pt;margin-left:40pt;line-height:150%"><b><span style="background:yellow">(*10일 후 취소 시 1년간 신청 제한 및 위약금 발생)</span></b></p>
<p style="${P}margin-left:20pt"><b><span style="color:blue">2. 해당 리조트에서 알림톡 발송되었으며, 일정 및 객실 타입 필히 확인 부탁드립니다.</span></b></p>`;
  if (r.prepay) {
    h += `
<p style="${P}margin-top:5pt;margin-left:20pt;line-height:150%"><b>3. 선 결제 방법: </b>알림톡 즉시결제 바로가기 URL → 개인 회원가입 → 로그아웃 → 즉시결제 바로가기 URL → 결제대기 페이지 → 결제완료</p>
<p style="${P}margin-top:5pt;margin-left:30pt;line-height:150%"><b><span style="color:red">※주의사항※ 개인 계정에서 예약취소 시 금액 환불만 진행되며 예약취소는 진행되지 않습니다.</span></b></p>
<p style="${P}margin-top:5pt;margin-left:90pt;line-height:150%"><b><span style="color:red">예약취소를 원하시면 반드시 ${esc(s.team)} 담당자에게 문의 바랍니다.</span></b></p>`;
  }
  h += `
<p style="${P}">&nbsp;</p>
<table cellspacing="0" cellpadding="0" style="margin-left:37pt;border-collapse:collapse;width:427px">
<tr><td colspan="4" style="${th}">예약 정보</td></tr>
<tr><td style="${th}width:103px">예약자명</td><td colspan="3" style="${td}">${val(d.name)}</td></tr>
<tr><td style="${th}">리조트명</td><td colspan="3" style="${td}">${esc(r.name)}</td></tr>
<tr><td style="${th}">예약번호</td><td colspan="3" style="${td}">${val(d.resNo)}</td></tr>
<tr><td rowspan="2" style="${th}">예약일자</td><td style="${th2}width:113px">입실일</td><td style="${th2}width:106px">퇴실일</td><td style="${th2}width:104px">비고</td></tr>
<tr><td style="${tdB}">${blue(d.checkin ? fmtDot(d.checkin) : BLANK)}</td><td style="${tdB}">${blue(d.checkout ? fmtDot(d.checkout) : BLANK)}</td><td style="${tdB}">${blue(nightsTxt)}</td></tr>
<tr><td style="${th}">객실요금</td><td colspan="3" style="${td}">${blue(`${d.price ? `${d.price}원` : BLANK} ${priceNote}`)}</td></tr>
<tr><td style="${th}">객실지역</td><td colspan="3" style="${td}">${val(d.region)}</td></tr>
<tr><td style="${th}">객실타입</td><td colspan="3" style="${td}">${val(d.roomType)}</td></tr>
</table>
<p style="${P}">&nbsp;</p>`;

  const capHtml = img.captures
    .map((src) => `<p style="${P}"><img src="${src}" style="max-width:1025px" alt="예약 캡처"></p>`)
    .join("");
  const fixedHtml = img.fixed
    ? `<p style="${P}"><img src="${img.fixed}" style="max-width:700px" alt="안내 이미지"></p>`
    : "";
  const extra = (r.extraAfterTable ?? "").replace(/<p style="margin:0">/g, `<p style="${P}">`);
  // 호반: 스파 안내 이미지 → 스파 문구 → 예약 캡처. 그 외: 예약 캡처 → 안내 이미지 → 추가 문구.
  h += r.guideFirst ? fixedHtml + extra + capHtml : capHtml + fixedHtml + extra;
  if (!img.captures.length) {
    h += `<p style="${P}"><span style="background:#ffe08a">[예약 캡처가 여기 들어갑니다]</span></p>`;
  }

  const contactLines = [
    s.phone && `<br><span style="${G}">휴대폰: ${esc(s.phone)}</span>`,
  ].filter(Boolean).join("");
  const links = [
    s.email && `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`,
    s.website && `<a href="http://${esc(s.website.replace(/^https?:\/\//, ""))}" style="color:#0563C1">${esc(s.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`,
  ].filter(Boolean).join(" | ");

  h += `
<p style="${P}">안전한 휴양소 이용으로 즐거운 시간 보내시길 바랍니다😊</p>
<p style="${P}">&nbsp;</p>
<p style="${P}">감사합니다.</p>
<p style="${P}">&nbsp;</p>
${img.logo ? `<p style="${P}"><img src="${img.logo}" width="262" height="53" alt="로고"></p>` : ""}
<p style="${P}">&nbsp;</p>
${s.slogan ? `<p style="${P}"><b><span style="color:#1F3864">${esc(s.slogan)}</span></b></p>` : ""}
<p style="${P}"><b><span style="color:#0057A6">${val(s.name)}</span> <span style="color:#696B75">/&nbsp;${esc(s.orgLine)}</span></b>${contactLines}</p>
${s.address ? `<p style="${P}"><span style="${G}">${esc(s.address)}</span></p>` : ""}
${links ? `<p style="${P}">${links}</p>` : ""}
</div>`;
  return forOutlook(h);
}

/**
 * Outlook(Word 엔진)은 CSS 글자색/배경을 놓치는 경우가 있어 옛 방식 태그를 같이 넣는다.
 * - 글자색: `<font color>`로 한 번 더 감싼다
 * - 노란 배경: `mso-highlight`(Word 형광펜) 추가
 */
function forOutlook(h: string): string {
  return h
    .replace(
      /<span style="color:([^;"]+)([^"]*)">([^<]*)<\/span>/g,
      '<font color="$1"><span style="color:$1$2">$3</span></font>',
    )
    .replace(/background:yellow/g, "background:yellow;mso-highlight:yellow");
}
