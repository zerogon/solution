/**
 * 대학알리미 HTML 파싱 및 경쟁률 데이터 추출
 * 대학알리미의 예상 HTML 구조를 기반으로 구현
 */

// 파싱 결과 타입 (DB 저장 전 원시 데이터)
export interface ParsedRate {
  universityName: string;   // 대학명 (원본)
  departmentName: string;   // 학과명 (원본)
  admissionType: string;    // 입시 유형 (수시/정시/편입학 등)
  year: number;             // 입시 연도
  applicants: number;       // 지원자 수
  accepted: number;         // 모집 인원
  rate: number;             // 경쟁률 (소수점 2자리)
  region?: string;          // 지역 (파싱 가능 시)
  universityType?: string;  // 설립 유형 (국립/사립 등)
}

/**
 * 대학알리미 경쟁률 테이블 예상 HTML 구조:
 *
 * <table class="tbl_type">
 *   <thead>
 *     <tr>
 *       <th>대학명</th>
 *       <th>모집단위(학과)</th>
 *       <th>전형유형</th>
 *       <th>모집인원</th>
 *       <th>지원자수</th>
 *       <th>경쟁률</th>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <tr>
 *       <td>경희대학교</td>
 *       <td>PostModern음악학과</td>
 *       <td>수시</td>
 *       <td>38</td>
 *       <td>1906</td>
 *       <td>50.17</td>
 *     </tr>
 *   </tbody>
 * </table>
 */

// 테이블 컬럼 인덱스 (사이트 구조 변경 시 수정 필요)
const COL_UNIVERSITY = 0;
const COL_DEPARTMENT = 1;
const COL_ADMISSION_TYPE = 2;
const COL_ACCEPTED = 3;
const COL_APPLICANTS = 4;
const COL_RATE = 5;

// 추가 정보가 있는 경우 컬럼 인덱스
const COL_REGION = 6;        // 선택적
const COL_UNIV_TYPE = 7;     // 선택적

/** 문자열에서 숫자 추출 (쉼표, 공백 제거) */
function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** 셀 텍스트 정제 */
function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')   // 다중 공백 → 단일 공백
    .replace(/\n|\r|\t/g, '') // 개행/탭 제거
    .trim();
}

/**
 * HTML 문자열에서 테이블 행을 추출
 * Node.js 환경에서 DOM 파서 없이 정규식 기반 파싱
 */
function extractTableRows(html: string): string[][] {
  const rows: string[][] = [];

  // tbody 내 tr 추출
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return rows;

  const tbody = tbodyMatch[1];

  // tr 추출
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trPattern.exec(tbody)) !== null) {
    const trContent = trMatch[1];

    // td 추출
    const cells: string[] = [];
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;

    while ((tdMatch = tdPattern.exec(trContent)) !== null) {
      // HTML 태그 제거 후 텍스트 정제
      const rawText = tdMatch[1].replace(/<[^>]+>/g, '');
      cells.push(cleanText(rawText));
    }

    if (cells.length >= 6) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * rowspan 처리를 위한 대학명 캐시
 * 대학알리미는 동일 대학의 여러 학과를 rowspan으로 병합 표시
 */
function resolveRowspan(rows: string[][]): string[][] {
  const resolved: string[][] = [];
  let lastUniversity = '';
  let lastRegion = '';
  let lastUnivType = '';

  for (const row of rows) {
    // 대학명이 비어있으면 이전 값 사용 (rowspan)
    if (row[COL_UNIVERSITY] === '' || row[COL_UNIVERSITY] === '-') {
      row[COL_UNIVERSITY] = lastUniversity;
      if (row[COL_REGION] === '' && lastRegion) row[COL_REGION] = lastRegion;
      if (row[COL_UNIV_TYPE] === '' && lastUnivType) row[COL_UNIV_TYPE] = lastUnivType;
    } else {
      lastUniversity = row[COL_UNIVERSITY];
      if (row[COL_REGION]) lastRegion = row[COL_REGION];
      if (row[COL_UNIV_TYPE]) lastUnivType = row[COL_UNIV_TYPE];
    }

    resolved.push(row);
  }

  return resolved;
}

/**
 * 경쟁률 계산 (직접 파싱 실패 시 지원자/모집인원으로 재계산)
 */
function calcRate(applicants: number, accepted: number, rawRate: string): number {
  const parsedRate = parseNumber(rawRate);

  if (parsedRate > 0) return Math.round(parsedRate * 100) / 100;
  if (accepted > 0) return Math.round((applicants / accepted) * 100) / 100;
  return 0;
}

/**
 * HTML에서 경쟁률 데이터 파싱 (메인 함수)
 */
export function parseAdmissionTable(html: string, year: number): ParsedRate[] {
  const rawRows = extractTableRows(html);
  const resolvedRows = resolveRowspan(rawRows);
  const results: ParsedRate[] = [];

  for (const row of resolvedRows) {
    const universityName = row[COL_UNIVERSITY];
    const departmentName = row[COL_DEPARTMENT];
    const admissionType = row[COL_ADMISSION_TYPE];
    const accepted = parseNumber(row[COL_ACCEPTED]);
    const applicants = parseNumber(row[COL_APPLICANTS]);
    const rate = calcRate(applicants, accepted, row[COL_RATE]);

    // 필수 필드 검증
    if (!universityName || !departmentName || !admissionType) {
      console.warn(`[parser] 필수 필드 누락: ${JSON.stringify(row)}`);
      continue;
    }

    // 모집인원 0인 경우 스킵 (미운영 학과)
    if (accepted === 0) continue;

    results.push({
      universityName,
      departmentName,
      admissionType,
      year,
      applicants,
      accepted,
      rate,
      region: row[COL_REGION] || undefined,
      universityType: row[COL_UNIV_TYPE] || undefined,
    });
  }

  console.log(`[parser] ${results.length}건 파싱 완료 (${year}년)`);
  return results;
}

/**
 * 입시 유형 정규화 (표기 통일)
 * 대학알리미에서 다양한 표기 방식을 사용
 */
export function normalizeAdmissionType(raw: string): string {
  const mapping: Record<string, string> = {
    '수시': '수시',
    '수시모집': '수시',
    '학생부종합': '수시',
    '학생부교과': '수시',
    '논술': '수시',
    '정시': '정시',
    '정시모집': '정시',
    '수능': '정시',
    '편입학': '편입학',
    '편입': '편입학',
    '재외국민': '재외국민특별전형',
    '재외국민특별전형': '재외국민특별전형',
    '특별전형': '특별전형',
  };

  const cleaned = raw.trim();
  return mapping[cleaned] ?? cleaned;
}

/**
 * 파싱 결과 유효성 검증
 */
export function validateParsedRate(rate: ParsedRate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rate.universityName) errors.push('대학명 누락');
  if (!rate.departmentName) errors.push('학과명 누락');
  if (!rate.admissionType) errors.push('전형유형 누락');
  if (rate.year < 2000 || rate.year > 2100) errors.push(`연도 범위 오류: ${rate.year}`);
  if (rate.applicants < 0) errors.push(`지원자수 음수: ${rate.applicants}`);
  if (rate.accepted <= 0) errors.push(`모집인원 0 이하: ${rate.accepted}`);
  if (rate.rate < 0) errors.push(`경쟁률 음수: ${rate.rate}`);

  return { valid: errors.length === 0, errors };
}
