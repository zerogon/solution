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

### 로그인은 폼 하나가 아니라 네 홉이고, 앞에 문지기가 둘 있다

`scripts/debug-page.ts doLogin`으로 성공한 로그인을 그대로 녹화한 결과(2026-08-09):

```
GET  netfunnel.lottehotel.com/ts.wseq?…&aid=login   ← 넷퍼넬(대기열/입장 제어)
POST members.lpoint.com/exView/api/callLgn_01_001
POST members.lpoint.com/exBiz/login/login_01_001    ← L.POINT가 실제로 인증
POST api.lottehotel.com/ssoLogin/ssoLogin           → {"code":"0000", …}
```

그리고 컨텍스트에 `reese84` · `visid_incap_*` · `nlbi_*` · `incap_ses_*` 쿠키가 쌓인다 —
**Imperva(Incapsula) WAF + Advanced Bot Protection**이다.

즉 폼 앞에 우리 셀렉터와 무관한 문지기가 둘(넷퍼넬, Imperva) 있고, 둘 중 하나에서
막히면 **페이지는 제출조차 안 한 것과 똑같아 보인다** — 에러도 알림도 없이 `isLogin`만
계속 false다. 프로덕션에서 반복되는 실패가 정확히 이 모양이라, 자격증명 오류로 오진하기
쉽다(실제로 한 번 오진했다).

한국 IP(로컬)에서는 안정적으로 통과하고 Vercel의 미국 리전에서는 4번에 1번쯤만 통과한다는
비대칭도 이 가설과 맞는다. **로그인 실패를 셀렉터 문제로 의심하기 전에 어느 홉까지 갔는지부터
볼 것** — `login.ts`가 실패 시 `[lotte] login failed — auth traffic`으로 홉 목록을,
`— bot-protection cookies`로 문지기 쿠키 유무를 남긴다.

- `login_01_001`이 없다 → L.POINT가 인증을 안 해줬다(자격증명 또는 그 앞 문지기)
- `ssoLogin`이 없다 → L.POINT는 통과했는데 lottehotel.com이 세션을 안 받았다
- 둘 다 없다 → 폼이 아니라 그 앞에서 막혔다

### 로그인 페이지를 가리는 쿠키 동의 레이어

로그인 화면 앞에 모달이 뜬다 — 제목 `최상의 경험 제공 (쿠키 활용 동의)`,
버튼 `쿠키 설정 / 전체 동의 / 필수·분석·마케팅 쿠키 더보기 / 확인`.
이걸 안 닫으면 **탭 클릭이 실패한다.** 실패가 고약한 건 원인과 증상이 떨어져
있다는 것 — 증상은 몇십 초 뒤 `locator.click: Timeout ... <div class="modal-dimm">
from <div class="layer-wrap"> subtree intercepts pointer events`라서 "탭 셀렉터가
깨졌다"처럼 읽힌다. 실제로 탭 자체는 로그에 정상 resolve된다.

- **감지는 `.modal-dimm:visible`로 한다.** `.layer-wrap`을 보면 안 된다 —
  페이지에 여러 개 있고 자식이 fixed라 래퍼 자신의 박스가 비어 `isVisible()`이
  false다. 클릭은 막히는데 검사만 통과하는 상태가 되고, 그러면 **로그가 아무것도
  안 남는다**(그 침묵 자체가 감지가 틀렸다는 신호였다). 래퍼는 버튼을 찾을
  scope로만 쓰고, 살아 있는 dimm을 가진 것을 고른다.
- **후보는 `getByText`로 찾는다.** 닫기 컨트롤이 `button` role이 아니라서
  `getByRole("button", { name: "전체 동의" })`는 못 잡았다.
- 레이어는 `domcontentloaded` 시점에 아직 DOM에 없다. 잠깐 기다린 뒤 확인하고,
  탭 클릭은 "닫고-클릭"을 몇 번 반복한다. 긴 타임아웃 하나로는 이 레이스에서
  회복할 수 없다 — 아무도 안 닫은 오버레이를 상대로 시간을 쓸 뿐이다.
- 후보가 전부 안 맞으면 레이어의 heading과 버튼 라벨을 로그에 남긴다(로그인당 1회).
  리전마다 다른 레이어가 뜰 수 있고, 그러지 않으면 여기서 보이지 않는다.
- 탭 입력창은 **두 탭이 DOM에 공존**하므로 `[data-tab-value="LPOINT"][aria-selected="true"]`가
  붙은 뒤에 채운다. 안 그러면 리조트 아이디가 리워즈 폼에 들어가고, 실패가
  자격증명 오류와 구분되지 않는다(에러 없이 `isLogin`만 계속 false).

## 로컬 검증

```bash
npx playwright install chromium    # 최초 1회
# /admin/accounts에 L.POINT 자격증명(실계정) 등록 후:
npx tsx scripts/run-crawl.ts       # 수동 크롤 (RefreshButton과 동일 경로)
npx tsx scripts/check-logs.ts      # crawl_logs / inventory / sessions 확인
npx tsx scripts/debug-page.ts roomlist   # 로그인 없이 검색+파싱 파이프라인만 테스트
npx tsx scripts/debug-page.ts doLogin    # 실로그인 + 네트워크 녹화 (성공한 로그인의 기준선)
npx tsx scripts/drop-session.ts LOTTE    # 캐시 세션 삭제 → 다음 크롤이 반드시 로그인
```

`drop-session.ts`가 필요한 이유: 유효한 세션이 있으면 크롤이 성공해도 **로그인에
대해서는 아무것도 말해주지 않는다**(`session valid, skipping login`). 로그인 경로를
검증하려면 세션을 지우고 시작해야 한다. 반대로 로그인 실패를 조사할 때는 시도가
실계정에 쌓인다는 것도 같이 기억할 것 — 반복 실패는 잠금 위험이 있다.

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

```bash
npx tsx scripts/set-active.ts LOTTE true    # 끌 때는 false
```

`active` 하나가 두 가지를 동시에 켠다 — `listCrawlableResorts()`가 3시간 크론을
그 리조트에 팬아웃하고, `getSearchCatalog()`가 조회 화면에 지점을 노출한다.
둘 다 코드 쪽 절반(등록된 크롤러 / `CATALOG` 등재)을 함께 요구하므로 스크립트가
그것도 같이 찍는다. 한쪽이 빠져 있으면 에러가 아니라 **빈 필터**로 나타난다.

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

# RESOM 크롤러 (book.resom.co.kr 회원 객실 예약)

리솜리조트(호반호텔앤리조트)의 예약 사이트는 `book.resom.co.kr`이고 Vue SPA다
(마케팅 사이트 `www.resom.co.kr`과 다른 호스트 — `Resort.baseUrl`은 후자를 가리키니
config의 `baseUrl`과 헷갈리지 말 것). 롯데·소노처럼 **브라우저는 로그인에만** 쓰고
검색은 `page.request`로 JSON을 직접 부른다. 수집 대상은 **회원 객실 예약 하나**다 —
패키지·추첨(`/drawLots`)·쿠폰 전용 예약은 다른 상품이라 같은 테이블에 섞으면
"잔여 객실"의 의미가 리조트마다 달라진다.

엔드포인트 (2026-08-09 실계정 검증, `apiBase` = `https://book.resom.co.kr/api/user/reservation`):

```
POST {apiBase}/auth/login                       로그인 (폼 조작으로 유발)
GET  {apiBase}/auth/info                        세션 검증 → member.memNo / memInd
GET  {apiBase}/roomReservation/allCondos        지점 + 객실유형 카탈로그
GET  {apiBase}/roomReservation/calendarRooms    잔여 객실 (날짜별 달력)
```

롯데·소노와 갈리는 지점은 넷이다.

- **API가 쿠키가 아니라 베어러 토큰이다.** 로그인 쿠키를 다 들고 가도 헤더가 없으면
  401이다. SPA는 `Authorization: Bearer …` + `login-id: <intnetId>` +
  `user-device: HOMEPAGE`를 보낸다.
  · 토큰은 **로그인 응답에만** 나온다(`{ accessToken, member: { intnetId, memNo, memInd } }`).
    사이트 자신은 localStorage에 pinia-persist로 넣는데, 키가
    `SHA256("hoban-user-front-local")`이고 값이 앱 상수 패스프레이즈로 AES 암호화돼 있다.
    **크롤러는 그 블롭을 읽지 않는다** — 프런트엔드 빌드의 난독화 세부에 묶이는 데다
    localStorage는 해당 오리진으로 이동해야만 읽힌다.
  · 대신 `login.ts`가 토큰을 **우리 쿠키**(`welfarestay_auth`, base64 JSON)에 넣는다.
    쿠키는 `storageState`에 그대로 실려 세션 재사용에서 살아남고, 네비게이션 없이
    `context.cookies()`로 읽히므로 `validateSession`이 롯데·소노처럼 요청 한 번으로 끝난다.
  · 조사 스크립트는 예외적으로 그 블롭을 복호화한다(`decryptPinia`). 질문 하나마다
    실계정 로그인을 새로 하지 않기 위한 것이지 크롤러 경로가 아니다.
- **`calendarRooms`는 체크인 날짜를 키로 하는 달력이다.** `{ "20260901": [ …객실유형… ], … }`
  이고 `ciYmd`..`coYmd` 범위를 **문자 그대로** 지킨다 — 20260809→20260930 요청이 월 경계를
  넘어 53일 전부를 구멍 없이 돌려줬다. 그래서 지점당 한 콜로 핫 윈도우 전체가 덮인다.
  요청 폭은 `RESOM.calendarSpanDays`(45일)이고, 이 상수는 **크롤러에만** 있다 —
  `windows.ts`에 사본을 두면 어긋났을 때 증상이 "그 날짜만 조용히 빔"이다.
- **`nights`는 재고에 아무 영향이 없다.** 1·2·7박 요청의 공통 180건이 `statusBooking`·
  `remdRmCnt`까지 전부 동일했다. 응답은 하룻밤씩을 말하므로 `parse.ts`가 숙박 일수만큼
  AND 한다(소노와 같은 결론이지만, 유추가 아니라 실측으로 얻은 것이다).
  판정할 밤이 하나라도 없으면 행을 **안 만든다**.
- **`remdRmCnt`가 음수로 나온다**(관측 -33). `statusBooking === 1` ⟺ `remdRmCnt > 0`이
  실측 180건에서 완전히 일치했으므로 예약 가능 판정은 `statusBooking`을 쓴다.
  마감임박은 사이트가 코드로 주지 않아 **롯데식 임계값 추론**이다(잔여 ≤ 2). 소노처럼
  사이트의 `E`를 쓰는 것과 근거가 다르다는 점을 기억할 것.

그 밖에:

- 지점 3곳 — 포레스트 리솜(1075·제천·**충북**), 스플라스 리솜(1027·덕산·충남),
  아일랜드 리솜(1001·안면도·충남). `region`은 API의 `bizNm`(덕산/제천/안면도)이 아니라
  **2글자 광역**으로 정규화한다. 안 그러면 지역 칩이 롯데·소노와 갈라진다.
- `roomType`에 `dongNm`을 붙인다(`"레스트리 S30 타워 클린"`). 동이 사실상 별개 숙소로
  홍보되고(포레스트/레스트리, 오션빌라스/오션타워, 스테이타워/플렉스타워), `roomType`이
  upsert 유니크 키의 일부라 이름이 겹치면 한쪽이 조용히 사라지기 때문이다.
- 객실유형 코드는 **config가 아니라 `allCondos`에서** 가져온다. `calendarRooms`가
  `rmTypeCd` 목록을 필수로 요구하고(빈 배열이면 400), 객실유형은 지점명과 달리 자주 바뀌며
  다른 무엇과도 일치할 필요가 없다. 지점명(`branchName`)만이 config 단독 출처다.
- 로그인 폼에 `<form>`도 `name`/`id`도 없다. 아이디는 placeholder로, 제출은
  `a.login_btn`으로 잡는다 — 페이지의 유일한 `button` role은 "GO"이고, 헤더에 같은
  접근성 이름의 `로그인` 앵커가 하나 더 있다.

실사이트 검증(2026-08-09): 전 지점 1윈도우 2,116행 11.4초, **핫 윈도우 60개 → 58개
스킵·요청 2세트(6콜) 4,186행 21초**(세션 재사용). 30일 핫 윈도우에 1박·2박 모두 결측
0일, 과거 날짜 0행, "2박 가능인데 1박 불가" 모순 0행, 지점·지역 카탈로그 완전 일치.

## 로컬 검증

```bash
npx tsx scripts/debug-resom.ts main       # 진입점 · 아웃바운드 호스트
npx tsx scripts/debug-resom.ts login      # 로그인 폼 인풋/클릭 후보
npx tsx scripts/debug-resom.ts doLogin    # 실로그인 → /tmp/resom-debug-state.json + 토큰 응답 shape
npx tsx scripts/debug-resom.ts net        # 예약 화면을 직접 몰며 JSON 전량 기록
npx tsx scripts/debug-resom.ts api <url>  # 저장된 세션 + 인증 헤더로 GET
npx tsx scripts/debug-resom.ts rows       # search+parse 단독 실행
npx tsx scripts/debug-resom.ts span       # 한 콜이 덮는 범위 · nights 무영향 재확인
npx tsx scripts/debug-resom.ts diff       # allCondos ↔ RESOM.branches 대조
npx tsx scripts/run-crawl.ts RESOM        # run.ts 전체 경로
npx tsx scripts/run-crawl.ts RESOM hot    # 핫 윈도우 60개 — 윈도우 스킵을 보는 유일한 방법
```

`doLogin`이 세션을 파일로 남기고 나머지 스텝이 재사용한다. `rows`/`span`은 그 세션에서
크롤러용 쿠키를 만들어 심으므로(`seedCrawlerCookie`) 파서를 고칠 때마다 실계정에
로그인이 쌓이지 않는다 — 반복 로그인 실패는 잠금 위험이라 그렇게 만들었다.

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성.
   가장 가까운 것을 복사한다 — 지점마다 한 콜이면 **lotte**, 한 콜에 여러 지점이면
   **sono**, 응답이 날짜 달력이거나 API가 쿠키가 아니라 토큰을 요구하면 **resom**.
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. `src/lib/resort-catalog.ts`의 `CATALOG`에 `{ properties }` 1항목 추가 —
   지점의 `branchName`/`label`/`region`만 뽑는다. **`bizCd` 등 크롤 전용 필드는 넣지 않는다**
   (이 모듈은 `server-only`지만, 넣으면 서버 컴포넌트가 클라이언트로 내려보내게 된다).
4. `/admin/accounts`에서 해당 리조트 자격증명 등록 (없으면 `run.ts`가 throw)
5. `npx tsx scripts/set-active.ts <SLUG> true`

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
