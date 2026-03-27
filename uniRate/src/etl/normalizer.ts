/**
 * 대학명 및 학과명 표준화 모듈
 * 약칭→정식명칭 매핑, 이름 변경 이력 처리, 지역/계열 분류
 */

import { ParsedRate } from './parser';

// ──────────────────────────────────────────────
// 대학명 표준화
// ──────────────────────────────────────────────

/**
 * 대학명 약칭 → 정식명칭 매핑
 * 입시 데이터에서 빈번히 등장하는 약칭을 정식명칭으로 변환
 */
const UNIVERSITY_NAME_MAP: Record<string, string> = {
  // 서울 주요 대학
  '서울대': '서울대학교',
  '연대': '연세대학교',
  '고대': '고려대학교',
  '성균관대': '성균관대학교',
  '한양대': '한양대학교',
  '중앙대': '중앙대학교',
  '경희대': '경희대학교',
  '한국외대': '한국외국어대학교',
  '서울시립대': '서울시립대학교',
  '건국대': '건국대학교',
  '동국대': '동국대학교',
  '홍익대': '홍익대학교',
  '국민대': '국민대학교',
  '숙명여대': '숙명여자대학교',
  '이화여대': '이화여자대학교',
  '성신여대': '성신여자대학교',
  '덕성여대': '덕성여자대학교',
  '광운대': '광운대학교',
  '명지대': '명지대학교',
  '상명대': '상명대학교',
  '서경대': '서경대학교',
  '세종대': '세종대학교',
  '숭실대': '숭실대학교',
  '인하대': '인하대학교',

  // 지방 주요 대학
  '부산대': '부산대학교',
  '경북대': '경북대학교',
  '전남대': '전남대학교',
  '전북대': '전북대학교',
  '충남대': '충남대학교',
  '충북대': '충북대학교',
  '강원대': '강원대학교',
  '제주대': '제주대학교',
  '경상국립대': '경상국립대학교',
  '창원대': '창원대학교',
  '군산대': '군산대학교',
  '목포대': '목포대학교',
  '순천대': '순천대학교',
  '안동대': '안동대학교',
  '한국교통대': '한국교통대학교',

  // 사립 지방 대학
  '동아대': '동아대학교',
  '부경대': '부경대학교',
  '계명대': '계명대학교',
  '영남대': '영남대학교',
  '대구가톨릭대': '대구가톨릭대학교',
  '조선대': '조선대학교',
  '원광대': '원광대학교',
  '우석대': '우석대학교',
  '단국대': '단국대학교',
  '가천대': '가천대학교',
  '아주대': '아주대학교',
  '인천대': '인천대학교',
  '카이스트': '한국과학기술원',
  'KAIST': '한국과학기술원',
  'POSTECH': '포항공과대학교',
  '포스텍': '포항공과대학교',
  'UNIST': '울산과학기술원',
  'GIST': '광주과학기술원',
  'DGIST': '대구경북과학기술원',

  // 교육대학
  '서울교대': '서울교육대학교',
  '경인교대': '경인교육대학교',
  '공주교대': '공주교육대학교',
  '광주교대': '광주교육대학교',
  '대구교대': '대구교육대학교',
  '부산교대': '부산교육대학교',
  '전주교대': '전주교육대학교',
  '진주교대': '진주교육대학교',
  '청주교대': '청주교육대학교',
  '춘천교대': '춘천교육대학교',
};

/**
 * 대학명 변경 이력 (구 이름 → 현 이름)
 * 연도별로 다른 이름으로 등록된 데이터를 통일
 */
const UNIVERSITY_RENAME_HISTORY: Array<{
  oldName: string;
  newName: string;
  changedYear: number; // 변경된 연도
}> = [
  { oldName: '경상대학교', newName: '경상국립대학교', changedYear: 2021 },
  { oldName: '부산수산대학교', newName: '부경대학교', changedYear: 1996 },
  { oldName: '서울산업대학교', newName: '서울과학기술대학교', changedYear: 2010 },
  { oldName: '인천대학교', newName: '인천대학교', changedYear: 2013 }, // 국립 전환
  { oldName: '공주대학교사범대학부설고등학교', newName: '공주대학교', changedYear: 2000 },
  { oldName: '한국해양대학교', newName: '한국해양대학교', changedYear: 2001 },
  { oldName: '대전대학교', newName: '대전대학교', changedYear: 2000 },
];

/**
 * 대학명 표준화
 * 1. 약칭을 정식명칭으로 변환
 * 2. "학교" 접미사 통일
 * 3. 공백 정제
 */
export function normalizeUniversityName(raw: string, year?: number): string {
  let name = raw.trim();

  // 약칭 매핑 적용
  if (UNIVERSITY_NAME_MAP[name]) {
    name = UNIVERSITY_NAME_MAP[name];
  }

  // 부분 일치 약칭 처리 (접두사 기반)
  for (const [abbr, full] of Object.entries(UNIVERSITY_NAME_MAP)) {
    if (name === abbr) {
      name = full;
      break;
    }
  }

  // 이름 변경 이력 처리 (현재 이름으로 통일)
  if (year !== undefined) {
    for (const history of UNIVERSITY_RENAME_HISTORY) {
      if (name === history.oldName && year >= history.changedYear) {
        name = history.newName;
        break;
      }
    }
  }

  // "학교" 접미사 없는 경우 추가 (정규 대학명 형식)
  if (name.endsWith('대') && !name.endsWith('대학교') && !name.endsWith('대학원')) {
    name = name + '학교';
  }

  return name;
}

// ──────────────────────────────────────────────
// 학과명 표준화
// ──────────────────────────────────────────────

/**
 * 학과명 유사 표현 → 표준 표현 매핑
 */
const DEPARTMENT_NAME_MAP: Record<string, string> = {
  // 컴퓨터 계열
  '컴퓨터공학과': '컴퓨터공학부',
  '컴퓨터과학과': '컴퓨터공학부',
  '소프트웨어학과': '소프트웨어학부',
  'SW학과': '소프트웨어학부',
  '전산학과': '컴퓨터공학부',
  'AI학과': '인공지능학과',
  '인공지능공학과': '인공지능학과',

  // 경영 계열
  '경영학과': '경영학부',
  '경영정보학과': '경영정보학부',
  'MIS학과': '경영정보학부',
  '회계학과': '경영학부',

  // 의료 계열
  '간호학과': '간호학부',
  '물리치료학과': '물리치료학과',
  '작업치료학과': '작업치료학과',
};

/**
 * 학과명 변경 이력
 */
const DEPARTMENT_RENAME_HISTORY: Array<{
  oldName: string;
  newName: string;
  changedYear: number;
}> = [
  { oldName: '전산학과', newName: '컴퓨터공학부', changedYear: 2010 },
  { oldName: '정보통신공학과', newName: '정보통신공학부', changedYear: 2015 },
];

/**
 * 학과명 표준화
 */
export function normalizeDepartmentName(raw: string, year?: number): string {
  let name = raw.trim();

  // 매핑 적용
  if (DEPARTMENT_NAME_MAP[name]) {
    name = DEPARTMENT_NAME_MAP[name];
  }

  // 이름 변경 이력 처리
  if (year !== undefined) {
    for (const history of DEPARTMENT_RENAME_HISTORY) {
      if (name === history.oldName && year >= history.changedYear) {
        name = history.newName;
        break;
      }
    }
  }

  return name;
}

// ──────────────────────────────────────────────
// 지역 매핑
// ──────────────────────────────────────────────

/**
 * 대학명 → 지역 매핑
 * 대학알리미에서 지역 정보가 없는 경우 대학명으로 추론
 */
const UNIVERSITY_REGION_MAP: Record<string, string> = {
  '서울대학교': '서울',
  '연세대학교': '서울',
  '고려대학교': '서울',
  '성균관대학교': '서울',
  '한양대학교': '서울',
  '중앙대학교': '서울',
  '경희대학교': '서울',
  '한국외국어대학교': '서울',
  '서울시립대학교': '서울',
  '건국대학교': '서울',
  '동국대학교': '서울',
  '홍익대학교': '서울',
  '이화여자대학교': '서울',
  '숙명여자대학교': '서울',

  '인하대학교': '인천',
  '인천대학교': '인천',
  '가천대학교': '경기',
  '아주대학교': '경기',
  '단국대학교': '경기',

  '부산대학교': '부산',
  '동아대학교': '부산',
  '부경대학교': '부산',

  '경북대학교': '대구',
  '계명대학교': '대구',
  '영남대학교': '경북',

  '전남대학교': '광주',
  '조선대학교': '광주',
  '전북대학교': '전북',
  '원광대학교': '전북',

  '충남대학교': '대전',
  '충북대학교': '충북',
  '강원대학교': '강원',
  '제주대학교': '제주',

  '한국과학기술원': '대전',
  '포항공과대학교': '경북',
  '울산과학기술원': '울산',
  '광주과학기술원': '광주',
  '대구경북과학기술원': '대구',
};

/** 지역 정규화 (시도 표준 이름) */
const REGION_NORMALIZE_MAP: Record<string, string> = {
  '서울시': '서울',
  '서울특별시': '서울',
  '부산시': '부산',
  '부산광역시': '부산',
  '인천시': '인천',
  '인천광역시': '인천',
  '대구시': '대구',
  '대구광역시': '대구',
  '광주시': '광주',
  '광주광역시': '광주',
  '대전시': '대전',
  '대전광역시': '대전',
  '울산시': '울산',
  '울산광역시': '울산',
  '세종시': '세종',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주도': '제주',
  '제주특별자치도': '제주',
};

/**
 * 지역명 표준화
 */
export function normalizeRegion(raw: string, universityName?: string): string {
  if (raw) {
    const cleaned = raw.trim();
    return REGION_NORMALIZE_MAP[cleaned] ?? cleaned;
  }

  // 대학명으로 지역 추론
  if (universityName) {
    return UNIVERSITY_REGION_MAP[universityName] ?? '기타';
  }

  return '기타';
}

// ──────────────────────────────────────────────
// 계열 분류
// ──────────────────────────────────────────────

/**
 * 학과명 키워드 → 계열 분류
 */
const DEPARTMENT_CATEGORY_RULES: Array<{
  keywords: string[];
  category: string;
}> = [
  { keywords: ['의학', '의예', '의무', '한의', '치의', '수의'], category: '의학계열' },
  { keywords: ['간호', '물리치료', '작업치료', '의료', '보건', '약학', '약대'], category: '의약계열' },
  { keywords: ['법학', '법과', '로스쿨', '법률'], category: '법학계열' },
  { keywords: ['경영', '경제', '무역', '회계', '마케팅', '금융', '보험'], category: '상경계열' },
  { keywords: ['컴퓨터', '소프트웨어', 'IT', '정보통신', '전산', 'AI', '인공지능', '데이터'], category: 'IT계열' },
  { keywords: ['전기', '전자', '반도체', '제어', '통신공학'], category: '전기전자계열' },
  { keywords: ['기계', '항공', '자동차', '로봇'], category: '기계계열' },
  { keywords: ['건축', '토목', '도시', '환경공학', '조경'], category: '건설계열' },
  { keywords: ['화학', '생명', '바이오', '생물', '식품', '농업'], category: '자연과학계열' },
  { keywords: ['교육', '교직', '사범', '유아', '초등'], category: '교육계열' },
  { keywords: ['사회', '행정', '정치', '언론', '미디어', '신문방송'], category: '사회계열' },
  { keywords: ['인문', '국어', '영어', '국문', '영문', '사학', '철학', '역사'], category: '인문계열' },
  { keywords: ['미술', '디자인', '음악', '체육', '예술', '연극', '영화', '무용'], category: '예체능계열' },
  { keywords: ['수학', '통계', '물리', '화학과', '지구'], category: '자연계열' },
];

/**
 * 학과명으로 계열 분류
 */
export function classifyDepartmentCategory(departmentName: string): string {
  for (const rule of DEPARTMENT_CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (departmentName.includes(keyword)) {
        return rule.category;
      }
    }
  }
  return '기타';
}

// ──────────────────────────────────────────────
// 설립 유형 표준화
// ──────────────────────────────────────────────

const UNIVERSITY_TYPE_MAP: Record<string, string> = {
  '국립': '국립',
  '공립': '공립',
  '사립': '사립',
  '국공립': '국립',
  '국립대학': '국립',
  '사립대학': '사립',
};

export function normalizeUniversityType(raw: string): string {
  const cleaned = raw.trim();
  return UNIVERSITY_TYPE_MAP[cleaned] ?? cleaned;
}

// ──────────────────────────────────────────────
// 통합 정규화 함수
// ──────────────────────────────────────────────

export interface NormalizedRate {
  universityName: string;
  departmentName: string;
  departmentCategory: string;
  admissionType: string;
  year: number;
  applicants: number;
  accepted: number;
  rate: number;
  region: string;
  universityType: string;
}

/**
 * ParsedRate → NormalizedRate 변환 (전체 정규화 파이프라인)
 */
export function normalizeRate(raw: ParsedRate): NormalizedRate {
  const universityName = normalizeUniversityName(raw.universityName, raw.year);
  const departmentName = normalizeDepartmentName(raw.departmentName, raw.year);

  return {
    universityName,
    departmentName,
    departmentCategory: classifyDepartmentCategory(departmentName),
    admissionType: raw.admissionType,
    year: raw.year,
    applicants: raw.applicants,
    accepted: raw.accepted,
    rate: raw.rate,
    region: normalizeRegion(raw.region ?? '', universityName),
    universityType: normalizeUniversityType(raw.universityType ?? '사립'),
  };
}

/**
 * 배치 정규화
 */
export function normalizeRates(raws: ParsedRate[]): NormalizedRate[] {
  return raws.map(normalizeRate);
}
