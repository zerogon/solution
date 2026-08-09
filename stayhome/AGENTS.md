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
- **응답이 요청 날짜 하루치가 아니다.** 요청한 `ciYmd` 주변 **약 23일치**를 항상
  돌려준다. `run.ts`는 반환된 모든 행을 자기가 요청한 한 윈도우 아래 upsert하므로
  `parse.ts`가 `ciYmd === checkinDt`로 **반드시 걸러야** 한다. (거르지 않으면
  8/20의 재고가 8/12로 저장된다.)

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
