<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Lotte 크롤러 (lottehotel.com 통합 사이트)

lotteresort.com은 2026-07에 LOTTE HOTELS & RESORTS(lottehotel.com)로 통합되었다.
현재 크롤러 구조 (`src/crawlers/lotte/`):

- **로그인만 브라우저 조작**: `www.lottehotel.com/global/ko/login/rewards`에서
  쿠키 동의 → **"L.POINT 로그인" 탭** 클릭 → `input[name=loginId/loginPw]` 입력.
  리조트 회원/법인회원은 리워즈 탭이 아니라 L.POINT 탭이어야 함 (사이트 안내문 기준).
- **검색은 JSON API 직접 호출** (DOM/달력 조작 없음):
  `GET resort.lottehotel.com/api/main/ko/reservation/roomList?rsvType=BAR&bizCd=..&checkinDt=YYYYMMDD&checkoutDt=YYYYMMDD&roomCnt=1`
  — `page.request`로 호출해 로그인 세션 쿠키가 함께 전달됨. 비로그인도 BAR 요금은 응답함.
- **세션 검증도 API**: `GET resort.lottehotel.com/common/login/isLogin` → `{ data: boolean }`.
- **파싱**: `roomList[].roomCnt`(잔여 객실 수) > 0 → available, ≤2 → closingSoon.
  빈 roomList는 만실(AVAILRSV)/예약미오픈(NORSV)으로 정상 0행 처리.
- 지점별 `bizCd`: 속초=81, 부여=61, 제주 아트빌라스=71, 김해=91.
  (산정호수는 통합 시 라인업 제외. bizCd 출처: CMS 카탈로그
  `resort.lottehotel.com/cms/common/hotel-catalogs/ko_catalogs.json`의 `anotherBookingUrl`)

## 로컬 검증

```bash
npx playwright install chromium    # 최초 1회
# /admin/accounts에 L.POINT 자격증명(실계정) 등록 후:
npx tsx scripts/run-crawl.ts       # 수동 크롤 (RefreshButton과 동일 경로)
npx tsx scripts/check-logs.ts      # crawl_logs / inventory / sessions 확인
npx tsx scripts/debug-page.ts roomlist   # 로그인 없이 검색+파싱 파이프라인만 테스트
```

성공 조건:
- `crawl_logs`: `status=SUCCESS`, `rows_upserted > 0`
- `resort_inventory`에 행 upsert, `checkin_date`가 KST 오늘의 UTC 자정과 일치
- `resort_sessions`에 storage_state 저장, 6시간 내 재실행 시 로그인 스킵

스케줄러(Phase C) 검증:

```bash
npm run inngest:dev        # 별 터미널: Inngest dev server (localhost:8288)
npm run dev                # 별 터미널
# 대시보드에서 scheduled-refresh를 Invoke 하거나, 이벤트를 직접 발행:
#   resort/crawl.requested  { "slug": "LOTTE", "windows": [{"checkin":"2026-08-10","checkout":"2026-08-11"}] }
```

`windows`를 생략하면 핫 윈도우 60개(30일 × 1~2박)를 전부 돈다 — 실사이트에 240 API콜이
나가므로 스모크 테스트에는 `windows`를 2~3개만 명시할 것.

로그인 실패 시 `CRAWLER_DEBUG_DIR=<dir>` 지정하면 `lotte-login-failed.png` 스크린샷 저장.
사이트 구조 탐색은 `scripts/debug-page.ts`의 스텝(main/login/lpoint/resort/search/dom/bizcds/roomlist) 활용.

## Resort 활성화

검증 통과 후:
```sql
UPDATE resorts SET active = true WHERE slug = 'LOTTE';
```

## 날짜 규약

"YYYY-MM-DD" 문자열 ↔ `parseDate()`(UTC 자정 Date)만 사용. Date를 로컬 API로
생성/해석 금지 (`todayKstIso`/`addDaysUtc` 유틸 사용, getter는 항상 `getUTC*`).

---

# SONO 크롤러 (sonohotelsresorts.com 회원 예약)

소노 사이트 전체가 `/api/hms/user/...` JSON API 위의 SPA다. 롯데와 마찬가지로
**브라우저는 로그인에만** 쓰고 검색은 `page.request`로 직접 호출한다.
롯데와 갈리는 지점은 셋:

- **비로그인으로는 아무것도 못 본다.** 예약 위젯을 로그아웃 상태로 열면
  "로그인이 필요합니다" 다이얼로그가 뜬다. 롯데의 BAR 요금처럼 공개된 재고가 없다.
- **`storeCdList`가 배열이라 여러 지점을 한 콜에 조회한다.** 실측: 32곳 한 번에
  7.4초/2.6MB, 1곳 0.35초/54KB. 그래서 `search.ts`가 지점 루프가 아니라
  **배치 루프**다 (`SONO.batchSize = 8` → 4콜). 전 지점 크롤이 로그인 포함 17초라
  `/admin/crawl-logs`의 전체 새로고침(maxDuration=60)도 안전하다.
- **응답은 "그 숙박이 되느냐"가 아니라 달력이다.** 실측(2026-08-09,
  `scripts/debug-sono.ts span`으로 재현 가능):
  - 요청한 `ciYmd`는 **달만 고른다.** 그 달 전체를 오늘로 클리핑하고 `nights-1`일
    꼬리를 붙여 돌려준다 — 0809·0820·0831 요청이 전부 `0809→0831`, 0915 요청이
    `0901→0930`. "요청일 주변 23일"이 아니다.
  - **`nights`는 재고에 아무 영향이 없다.** 1박·2박·7박 요청의 공통 엔트리 299건이
    상태코드·잔여수까지 전부 동일했다.

  그래서 `parse.ts`가 응답을 **달력으로 읽고 숙박 일수만큼 AND** 한다 — N박은 모든
  밤이 예약 가능해야 가능이고, 한 밤이라도 마감임박이면 마감임박이다. 응답의 꼬리
  `nights-1`일이 정확히 월말 걸친 숙박을 판정할 데이터라 월 경계에도 구멍이 없고,
  밤이 하나라도 없으면 행을 **안 만든다**(추측하지 않는다).

  이걸 안 하고 응답을 요청 윈도우 아래 그대로 넣으면 **체크인 당일 상태만 보고
  "2박 가능"이라 주장**하게 된다. 실측상 그 차이가 예약가능 6,379행 → 5,720행이었다.

엔드포인트 (2026-08-09 실계정 검증):

```
POST {apiBase}/management/auth/login              로그인 (폼 조작으로 유발)
GET  {apiBase}/management/auth/userinfo           세션 검증 → body.userInfo.memNo
GET  {apiBase}/memberReservation/room/placeList   지점 목록 (조사용)
POST {apiBase}/memberReservation/room/list/pc     잔여 객실
```

- 로그인 폼은 `#lginId` / `#lginPw`. **`<form>` 요소가 없고** `name` 속성도 없다.
  헤더의 "로그인" 링크가 제출 버튼과 접근성 이름이 같아 셀렉터를 폼 영역으로 좁혀야 한다.
- `memNo`는 계정마다 다르므로 매 윈도우 `userinfo`에서 읽는다 (config에 박지 않는다).
  `userIndCd:"Y"` / `rsvIndCd:"9"`는 SPA 요청에서 관측한 상수라 `SONO.request`에 고정 —
  다른 계정에서 전 지점 0행이 나오면 여기부터 다시 캔다.
- 상태 코드 `A`=예약원활 `E`=마감임박 `D`=예약마감 `W`=예약대기 `N`=예약불가.
  `rsvRmCnt`는 예약대기 행에서 **음수**가 나온다(관측 -31). `closingSoon`은
  임계값 추론이 아니라 사이트의 `E`를 그대로 쓴다 — 23일×32지점 실측에서 A의 잔여
  중앙값 54~206, E는 3~11로 상태 코드가 잔여와 잘 대응했다.
- 지점 32곳. `outsYn:"Y"`인 3곳(파나크 영덕·팔라티움 해운대·소노벨 경주 감포)은
  **회원 예약 응답에서 조용히 빠지므로** config에서 제외했다 (에러가 아니라 무응답).
- `region`은 API의 `jiyukNm`(강원권/경상권…)이나 `addr` 접두사(강원특별자치도/강원도/
  경북/경상북도 혼재)가 아니라 **롯데와 같은 2글자 광역**으로 정규화해 하드코딩한다.
  안 그러면 지역 칩이 롯데와 갈라진다.
- `branchName`은 `config.branches[].value`가 유일 출처다. placeList는 storeCd 09를
  "소노벨 A 비발디파크", room/list는 "소노벨 비발디파크 A"라고 부른다 — 파서가
  응답의 `storeNm`을 읽으면 그 순간 카탈로그와 어긋난다.

## 로컬 검증

```bash
npx tsx scripts/debug-sono.ts main       # 진입점 · 헤더 · 아웃바운드 호스트
npx tsx scripts/debug-sono.ts login      # 로그인 폼 인풋/버튼/프레임
npx tsx scripts/debug-sono.ts doLogin    # 실로그인 → /tmp/sono-debug-state.json 저장
npx tsx scripts/debug-sono.ts doSearch   # 위젯 구동 + 요청/응답 페이로드 전량 덤프
npx tsx scripts/debug-sono.ts api <url>  # 저장된 세션으로 GET
POST_BODY='{...}' npx tsx scripts/debug-sono.ts apiPost <url>
npx tsx scripts/debug-sono.ts rows ["지점명"]   # search+parse 단독 실행
npx tsx scripts/debug-sono.ts span             # 한 콜이 덮는 범위 · nights 무영향 재확인
npx tsx scripts/debug-sono.ts diff       # 사이트 지점 목록 ↔ SONO.branches 대조
```

`doLogin`이 세션을 파일로 남기고 나머지 스텝이 재사용한다 — 스텝마다 로그인하면
사이트 레이트리밋에 걸린다.

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성
   (lotte 또는 sono 복사 후 수정 — 사이트가 다중 지점 배치 조회를 지원하면 sono 쪽이 가깝다)
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. `src/lib/resort-catalog.ts`의 `CATALOG`에 `{ properties }` 1항목 추가 —
   지점의 `branchName`/`label`/`region`만 뽑는다. **`bizCd` 등 크롤 전용 필드는 넣지 않는다**
   (이 모듈은 `server-only`지만, 넣으면 서버 컴포넌트가 클라이언트로 내려보내게 된다).
4. `/admin/accounts`에서 해당 리조트 자격증명 등록 (없으면 `run.ts`가 throw)
5. Neon에서 `UPDATE resorts SET active = true WHERE slug = '<SLUG>'`

핵심 코드(`run.ts`, `_shared/*`)는 물론 **Inngest 함수·조회 UI·`/api/inventory`도 무수정**이다.
`crawl-resort`는 slug를 인자로 받는 단일 함수이고(리조트별 함수가 아니다),
`scheduled-refresh`가 `listCrawlableResorts()`(= `active` ∩ 등록된 크롤러)로 팬아웃한다.

추가 후 확인 — 지점 문자열이 카탈로그와 실제 수집 결과 사이에서 어긋나지 않았는지:

```sql
SELECT DISTINCT resort_name, branch_name, region FROM resort_inventory ORDER BY 1, 2;
```

`branchName`은 크롤러 config의 `value`가 그대로 저장된 값이고 카탈로그도 같은 배열을
읽으므로 자동으로 일치해야 한다. 어긋난다면 크롤러가 `config.branches`를 우회해
지점명을 만들고 있다는 뜻이다 (증상은 "필터를 눌렀는데 0건").

## 요청한 날짜보다 넓게 답하는 사이트 (`InventoryRow.stay`)

기본값은 "크롤러가 돌려준 행 = 요청한 윈도우의 재고"이고, 롯데가 그렇다. 사이트가
요청 날짜 하나에 **여러 날짜를 한꺼번에** 답한다면 행마다
`stay: { checkin, checkout }`을 붙여라. 그러면

- `run.ts`가 그 행을 요청 윈도우가 아니라 **행 자신의 날짜** 아래 upsert하고,
- **그 패스에서 이미 답을 받은 윈도우를 건너뛴다.** 소노의 60개 핫 윈도우가
  실제 요청 4번(2개월 × 2숙박길이)이 되는 게 이 스킵이다 — 실측 40초·17,914행.

`stay`를 안 붙이면 동작은 종전과 완전히 동일하다.

주의할 점 셋:

- **`windows.ts`에 리조트별 상수를 두지 않는다.** 응답이 며칠을 덮는지는 크롤러만
  관측할 수 있고, 스케줄러에 사본을 두면 어긋났을 때 증상이 "그 날짜만 조용히 빔"이다.
  스킵은 실제로 받은 행에서 계산되므로 그런 사본이 없다.
- **`checkin`/`checkout`은 둘 다이거나 둘 다 아니다.** 하나만 주면 나머지가 요청
  윈도우에서 상속돼, 아무도 측정하지 않은 숙박 길이를 주장하게 된다.
- **넓은 응답이 곧 "그 숙박이 가능하다"는 뜻은 아니다.** 소노처럼 날짜별 달력을 주는
  사이트라면 숙박 일수만큼 AND 해야 한다(위 SONO 절). 판정할 밤이 없으면 행을
  만들지 말 것 — 없는 행은 조회에서 "데이터 없음"이지만, 틀린 행은 헛걸음이다.

행 수가 크게 늘 수 있다는 것도 염두에 둘 것. `upsertInventory`는 다중행 INSERT 한
문장이라 Postgres의 바인드 파라미터 상한 65,535(행당 12개)에 걸린다 —
`UPSERT_CHUNK_ROWS`로 1,000행씩 끊는다. 소노 한 콜이 ~3,900행이다.
