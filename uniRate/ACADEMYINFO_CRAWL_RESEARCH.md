# 대학알리미(academyinfo.go.kr) 크롤러 리서치 결과

> 작성일: 2026-03-29
> 목적: 연도별 실용음악과 경쟁률 수집을 위한 대학알리미 사이트 분석

---

## 배경

- **문제**: 현재 사용 중인 adiga.kr(대학어디가)는 연도를 바꿔도 **동일한 경쟁률**을 반환하여 연도별 추이 분석이 불가능
- **목표**: 대학알리미에서 2023~2025년 연도별 실제 경쟁률 데이터 수집
- **대상 학과**: 실용음악 관련 (키워드: 실용음악, 포스트모던, PostModern, 현대실용음악, K-POP, 뮤직프로덕션, 싱어송라이팅)

---

## 사이트 구조 분석

### 기존 scraper.ts는 사용 불가
- `scraper.ts`의 URL 패턴(`/pubinfo/pubinfo04020002.do`)은 **404 반환**
- 사이트는 HTML 테이블이 아닌 **RealGrid**(JS 그리드 라이브러리)를 사용
- `parser.ts`가 전제하는 `<table class="tbl_type">` 구조는 실제 사이트에 존재하지 않음

### 다운로드 페이지 (`/popup/main0810/list.do`)

#### 페이지 구성
- **RealGrid 1 (grid1)**: 공시항목 목록 (112개 행)
- **RealGrid 2 (grid2)**: 사용자가 선택한 다운로드 대상 항목
- **사용자 정보**: dwldUsrDivCd(사용자구분), dwldPrpsCd(다운로드목적), dwldDtlCtnt(상세내용)
- **학교 구분 셀렉트**: comboSelRst (전문대학=01, 대학=02, 대학원=03, 대학원대학=04)

#### 공시항목 카테고리 (itemDivCd → messageArr)
| 코드 | 카테고리명 |
|------|-----------|
| 01 | 학생 |
| 04 | 교육여건 |
| 02 | 교육연구성과 |
| 03 | 대학재정/교육비 |
| 05 | 대학운영 |
| all | 전체목록 |

#### 입학전형 항목 정보 (핵심)
```
행 인덱스: 4 (grid1에서)
pgm_id: 3033
pgm_kor_shrt_nm: "가. 입학전형 유형별 선발 결과"
pgm_estn_nm: "4-가. 입학전형 유형별 선발 결과"
pgm_clft_cd: "P" (출력구분 있음)
item_id: 25
schl_div_cd: "02" (대학)
```

#### RealGrid 필드 매핑 (grid1)
| 필드 | 의미 | 예시값 |
|------|------|--------|
| field1 | 카테고리 | "학생" |
| field2 | 공시항목명 | "4-가. 입학전형 유형별 선발 결과" |
| field5 | 출력구분 개수(?) | "0" |
| field51 | 출력구분 코드 배열 | "25^^10" |
| field52 | 출력구분 개수 | "1" |
| field53 | 출력구분 코드 | "25^^10" (item_id^^knd_cd) |
| field54 | item_id | "25" |
| field55 | 출력라벨 | "학교별" |
| field6 / field61 | 1번 연도 체크/라벨 | "0" / "2023" |
| field7 / field71 | 2번 연도 체크/라벨 | "0" / "2024" |
| field8 / field81 | 3번 연도 체크/라벨 | "0" / "2025" |
| field9 | 추가 버튼 | "[추가]" |
| field10 | 연도 개수 | "3" |
| field11 | item_id | "25" |

#### RealGrid 필드 매핑 (grid2 — 선택 항목)
| 필드 | 의미 |
|------|------|
| field53 | 출력코드 (예: "25^^10") |
| field54 | 출력년도 (예: "2023") |

**주의**: grid1과 grid2에서 field53/field54의 의미가 다름!

---

## API 엔드포인트

### 공시항목 목록 조회
```
POST /popup/main0810/selectDataList.do
Body: schlDivCd=02&itemDivCd=01&searchValue=
Response: {
  ajaxList2: [...공시항목 배열...],   // 상세 항목 (pgm_id, pgm_kor_shrt_nm, item_id 등)
  ajaxList3: [...],
  ajaxList4: [...],
  ajaxList5: [...연도 정보...],       // svy_yr, acif_svy_yr
  ajaxList6: [...출력구분 정보...]    // acif_dta_rqst_knd_cd
}
```

### IPN 코드 조회
```
POST /popup/main0810/selectIPN.do
Response: {
  IPN54: [{cd: "000", kor_cd_nm: "선택"}, ...],  // 9개
  IPN55: [{cd: "000", kor_cd_nm: "선택"}, ...]   // 8개
}
```

### 파일 목록 조회 (사전 생성된 파일)
```
POST /popup/main0810/selectReqList.do
Body: schlDivCd=02&itemDivCd=01&svyYr=&all=02&fp=&fn=&sn=&all={출력코드}&all={년도}&...
Response: { resultList1: [...파일 목록...] }
```
**현재 상태**: "입학전형 유형별 선발 결과" 항목은 `resultList1: []` (빈 배열) 반환 — **사전 생성된 파일 없음**

### 파일 생성 요청/확인
```
POST /popup/main0810/selectReqRst.do
Body: schlDivCd=02&itemDivCd=01&svyYr=&all=02&fp=&fn=&sn={출력코드}^^{년도}&...
Response: {
  resultList: {
    fp: "/upload/",
    fn: "data.zip",
    sn: "data_20260329221312.zip",
    exist: "0",          // "0"=미생성, "1"=준비완료
    selFileArr: [],
    paramSvyYr: "2025",
    ...
  }
}
```
**현재 상태**: `exist: "0"`, `selFileArr: []` — 파일이 생성되지 않음 (100초 폴링 후에도)

### 파일 다운로드
```
POST /popup/main0810/download.do
Form: fp, fn, sn 값 설정 후 form submit
```

### 파일 이력 저장
```
POST /popup/main0810/fileInsert.do
```

---

## Strategy A (Excel 다운로드) — 실패

### 시도한 내용
1. 다운로드 페이지 접속 → RealGrid 초기화 대기
2. grid1에서 "입학전형 유형별 선발 결과" 항목 찾기 (idx=4)
3. 연도 체크박스 활성화 (field6/7/8) + grid2에 항목 추가 (fn_dashMap)
4. selectReqList.do 호출 → **빈 배열 반환**
5. selectReqRst.do 직접 호출 → `exist: "0"`, 100초 폴링 후에도 변화 없음
6. 다운로드 버튼 클릭 → alert("파일이 존재하지 않습니다") 예상

### 실패 원인
서버에 해당 항목의 사전 생성된 다운로드 파일이 존재하지 않음. 대학알리미의 일괄 다운로드는 **모든 항목이 항상 이용 가능한 것이 아니라**, 서버에서 미리 생성해둔 파일만 제공.

---

## Strategy B (개별 대학 AJAX 인터셉트) — 미구현

### 접근 방식
1. 대학 목록 조회 API로 전체 대학 코드(schlCd) 수집
2. 각 대학의 공시 상세 페이지 접근 (`/uip/uip0600/init.do?schlCd=XXX`)
3. Playwright `page.on('response')`로 RealGrid AJAX JSON 응답 가로채기
4. "입학전형 유형별 선발 결과" 데이터 추출
5. 연도 파라미터 변경 후 재요청

### 주의사항
- 200+ 대학 × 3개 연도 = 600+ 요청 — Rate limiting 필수 (3~5초)
- 대학 목록 API 엔드포인트 미확인 (시도한 URL들 실패)
- 학교별 다운로드 페이지(`/popup/main0820/list.do?schlDivCd=02&svyYr=2025`)도 동일한 RealGrid 구조

### 대학 목록 API 후보 (미검증)
```
/main/main2130/selectSchlList.do (실패)
/main/main0330/selectSchlList.do (실패)
/uip/uip0100/selectSchlList.do (실패)
```

---

## 기존 파일 현황

### 현재 구현된 파일
| 파일 | 상태 | 설명 |
|------|------|------|
| `src/etl/crawl-academyinfo.ts` | **작업중** | Strategy A + B 프레임워크, 파싱 로직 포함 |
| `src/etl/crawl-applied-music.ts` | **완성** | adiga.kr 전국 크롤러 (서울 필터 제거 완료) |
| `src/etl/load-crawled-data.ts` | **완성** | adiga.kr 데이터 DB 로더 (연도별 보존) |
| `src/etl/load-academyinfo-data.ts` | **미생성** | 대학알리미 데이터 DB 로더 |
| `data/debug-academyinfo-download-page.html` | 디버그용 | 다운로드 페이지 전체 HTML (63KB) |

### 삭제 대상 디버그 파일
- `src/etl/debug-year.ts`
- `src/etl/debug-music-years.ts`
- `src/etl/debug-diff-check.ts`

### package.json 스크립트 (이미 추가됨)
```json
"etl:crawl:academyinfo": "tsx --env-file=.env.local src/etl/crawl-academyinfo.ts",
"etl:load:academyinfo": "tsx --env-file=.env.local src/etl/load-academyinfo-data.ts"
```

---

## 재사용 가능한 기존 모듈
- `normalizer.ts`: `inferUniversityType()`, `normalizeUniversityName()`, `normalizeRegion()`
- `loader.ts`: `loadRates(RateRecord[])` — DB 적재 그대로 사용
- `xlsx` 패키지: 이미 설치됨 (`pnpm add xlsx` 완료)

---

## 다음 단계 (TODO)

1. **Strategy B 본격 구현**: 개별 대학 페이지의 AJAX 인터셉트 방식
   - 대학 목록 API 엔드포인트 찾기 (메인 페이지 네트워크 탭 분석 필요)
   - 개별 대학 공시 상세에서 "입학전형 유형별 선발 결과" 데이터 구조 파악
   - 연도 전환 메커니즘 확인

2. **대안 검토**:
   - 대학알리미 외 다른 데이터 소스 탐색
   - 수동 다운로드 후 파싱 (일회성)
   - 대학어디가 데이터를 최신 1년만 사용하는 방안

3. **load-academyinfo-data.ts 생성**: crawled JSON → DB 로더
4. **디버그 파일 정리**: debug-*.ts 삭제
