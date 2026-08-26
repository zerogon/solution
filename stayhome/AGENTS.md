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

### 요금은 재고 응답 안에 이미 있다 — 그리고 2026-08-26부터 실제로 수집한다

`roomList`의 한 객실은 키 **49개**를 갖고 있고 `parse.ts`의 `RoomListPayload`는 그중 5개만
선언한다("Subset ... we rely on"이라고 스스로 적어둔 그대로다). 나머지에 요금이 있다 —
`keys` 스텝이 세어서 확인했다.

| 키 | 뜻 | 관측 (속초, 1박) |
| --- | --- | --- |
| `roomAvgAmt` | **숙박 기간의 1박 평균가** | 238,620 |
| `minRateAmt` | 그 숙박에서 가장 싼 하룻밤 | 238,620 |
| `earlybirdRateAmt` | 얼리버드 적용 시 1박가 | 265,000 |
| `pointAmt` · `pointFullAmt` | 적립 포인트(원이 아님) | 662 · 16,558 |

- **총액이 아니라 1박 값이다.** 같은 방을 1·2·3박으로 물었을 때 `roomAvgAmt`가
  238,620 → 234,255 → 232,800으로 *줄었다*. 평일이 섞이며 평균이 내려간 것이고,
  숙박 총액은 `roomAvgAmt × 박수`다 — 2박 234,255×2 = 468,510 = 238,620(주말) + 229,890(평일)로
  `minRateAmt`와 산술이 정확히 맞는다. 이 값을 그대로 "2박 요금"이라 부르면 실제의 절반을
  발행하게 되고, 그건 2026-08-09에 고친 소노 2박 버그와 같은 모양이다.
- **BAR 공시가이지 회원가가 아니다.** 요청이 `rsvType=BAR`이고 응답의 `memberType`은
  전 객실 `""`이다. 사이트 자신도 비로그인 상태에서 `memberNo=`를 빈 값으로 보낸다.
  즉 이 숫자는 "지금 아무나 예약하면 내는 값"이지 제휴 담당자가 안내할 값이 아닐 수 있다.
- **추가 호출이 없다.** 크롤러가 이미 받아 버리고 있는 응답 안이라 요청 수·예산에 영향 0.
- `roomNm`은 13개 객실이 전부 서로 달라(`parse.ts:44-47`의 dedupe가 실제로 지우는 게 없다)
  행 하나에 정확한 값 하나를 붙일 수 있다.

**수집(2026-08-26).** `RoomListPayload`에 `roomAvgAmt`를 선언하고 `parse.ts`의 `stayTotal`이
읽는다. 규칙 셋:

- **박수를 곱한다.** `InventoryRow.price`의 계약이 "이 행이 서술하는 숙박 **전체**의
  요금"인데 `roomAvgAmt`는 1박 평균이다. 평균 × 박수 = 총액인 것은 평균의 정의이지 추정이
  아니고, 사이트가 반올림한 평균을 주므로 마지막 자리가 몇 원 어긋날 수 있다 — 그건
  안내를 틀리게 만들 크기가 아니지만 곱을 생략했을 때의 오차는 100%다.
- **`available`한 행에만 붙인다.** `roomList`에는 매진된 방(대기예약)도 실려 있고 거기에도
  금액이 있다. 실측: 가용성을 안 보면 113행이 `available=false`인 채 요금을 갖는다.
  화면의 `showsPrice(tone)`가 어차피 거르지만("예약할 수 없는 방의 가격은 정보가 아니라
  잡음이다") DB에 두면 이 저장소의 불변식이 깨진다.
- **`withPrices` 게이트를 타지 않는다.** 그 게이트는 *비용*을 재는 것이고 롯데는 0이다.
  즉 롯데 요금은 최신화가 아니라 **정기 수집에서** 붙는다 — 다섯 곳 중 유일하다.
- 값이 숫자가 아니거나(`""`·null) 0 이하면 붙이지 않는다. **필드가 있다고 값이 있는 게
  아니다** — 리솜 `rmAmt`가 506엔트리 전부 `"0"`이었다.

실사이트 검증(2026-08-26): 단일 윈도우 45행 중 **요금 38행**(나머지 7행은 마감),
핫 윈도우 60/60 **2,464행 중 1,857행**. 같은 방 1·2·3박 총액이 328,830 → 811,890 →
1,087,371로 박수에 비례(비율이 정확히 2·3이 아닌 것은 주말이 섞이며 평균이 움직이기
때문이다). DB 불변식 위반 0건 — `price>0`, `price_kind` 동반, `available=false`에 요금 없음,
**2박 총액 ≤ 1박 총액인 행 0건**.

## 로컬 검증

```bash
npx playwright install chromium    # 최초 1회
# /admin/accounts에 L.POINT 자격증명(실계정) 등록 후:
npx tsx scripts/run-crawl.ts       # 수동 크롤 (RefreshButton과 동일 경로)
npx tsx scripts/check-logs.ts      # crawl_logs / inventory / sessions 확인
npx tsx scripts/debug-page.ts roomlist   # 로그인 없이 검색+파싱 파이프라인만 테스트
npx tsx scripts/debug-page.ts doLogin    # 실로그인 + 네트워크 녹화 (성공한 로그인의 기준선)
npx tsx scripts/debug-page.ts keys       # 응답 키 전수 조사 (금액 조사, 로그인 불필요)
npx tsx scripts/drop-session.ts LOTTE    # 캐시 세션 삭제 → 다음 크롤이 반드시 로그인
npx tsx scripts/login-check.ts           # 5곳 로그인만 순차 점검 (아래)
```

`login-check.ts`는 리조트별 `debug-*.ts doLogin`과 다른 질문에 답한다. 그 스텝들은 충실도가
제각각이라(롯데·한화는 크롤러의 `performLogin`을 부르지만 소노·리솜·오크밸리는 스크립트가
폼을 직접 몬다) "사이트에 로그인이 되나"까지만 말해준다. `login-check.ts`는 5곳 모두에서
`registry` → `crawler.login()` → `validateSession()`으로 **`run.ts`와 같은 경로**를 태우므로
"크롤러의 로그인이 되나"에 답한다. `crawl_logs`·`resort_sessions`·`resort_inventory`에
아무것도 쓰지 않고(`--save` 명시 시 세션만 저장), 재시도하지 않으며(실계정 잠금 위험),
자격증명은 길이만 찍는다. 순차 실행이고, 실패 스크린샷을 남기려면 `CRAWLER_DEBUG_DIR`이
필요하다 — 없으면 각 크롤러가 스크린샷을 조용히 건너뛴다.

```bash
CRAWLER_DEBUG_DIR=/tmp/login-check npx tsx scripts/login-check.ts          # 5곳 전부
npx tsx scripts/login-check.ts HANWHA SONO                                 # 일부만
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

### 요금은 없다 — 재고 응답에도, 그 **다음 화면**에도 (금액 조사 2026-08-24 · Q2 보강 08-25)

**Q1 — 우리가 읽는 응답.** `rmTypeList`의 한 엔트리는 키 **15개**이고 그중 돈은 하나도
없다 — 240엔트리 전수: `ciYmd errorId errorMsg levelYn pyeongCd resortTypeCd resortTypeNm
rmTypeCd roomTypeCd roomTypeNm rsvRmCnt rsvStatusCd rsvStatusNm storeCd viewCd`.
지점 객체(`body[]`)도 `storeCd storeNm outsYn` 셋뿐이라 "지점 최저가" 같은 것도 없다.

**Q2 — 그 화면이 부르는 다른 콜** (`flow` 스텝, 2026-08-25). 08-24 시점에 이 절은
Q1만 근거로 "요금은 없다"고 적고 있었다. 그건 **재고 응답에 없다**는 뜻이었지 사이트에
없다는 뜻이 아니었고, 리솜이 정확히 그 자리에서 뒤집혔다(달력의 `rmAmt`는 전부 `"0"`,
진짜 회원가는 객실 클릭 때 부르는 `stockPrice`에 있었다). 그래서 예약 흐름을 실제로
몰아 **객실 선택 단계까지** 걸으며 JSON 전량을 본문까지 기록했다. 결론은 유지된다.

- **`POST memberReservation/room/detail`**이 소노판 `stockPrice`다 — 객실 선택 홉에서
  딱 한 번 불린다. 엔트리당 키가 15개에서 **34개로 늘지만 요금은 없다.** 늘어난 것은
  `dongNm bedNm cookNm penaltyYn petYn waitSeq partialWaitDays partialAvailableDays
  ciOverStnd groupRoomNameNm` 같은 재고·속성 필드다. 돈 이름을 가진 유일한 필드
  `outsTotAmt`는 **16엔트리 전부 null**이다(`outsItemCd`·`outsRmTpCd`도 같이 null —
  외부 위탁 상품 자리이고, 이 계정엔 해당이 없다).
- 같은 홉의 나머지도 전부 무(無): `reserveRoomLinkUrlMulti`(객실 소개 페이지 링크),
  `penalty/room/list`·`penalty/room/prdtSeq`(위약 판정), `store/name`·`store/info`,
  `holiday/list`, `room/filter`, `room/reserve/pre`, `room/reserve/session/check`.
- ⚠️ **스캐너가 고장 난 게 아니다.** 같은 실행에서 `ebiz/reserve/sales/NEW_AND_HOT/list`와
  `.../PACKAGE/list`의 `amt`를 **정상적으로 잡아냈다**(`"\ 104,000 ~"`, `originalAmt`
  `"218,000"`). 그건 홈 화면의 **패키지 판매 상품**이지 회원 객실 예약이 아니다 —
  리솜의 `room/price/list`(패키지)와 정확히 같은 함정이고, 이름만 보고 집으면
  **다른 상품의 요금을 회원 객실 재고 옆에 붙이게 된다.**
- **비용은 문제가 아니었다.** `room/detail` 요청은 `{"storeCdList":["29"], ciYmd, coYmd,
  nights, rmCnt, adultCnt, childCnt}` 하나로 그 지점 **13개 객실유형 전체**를 860ms에
  답한다. 리솜처럼 행마다 한 콜이 아니라 `room/list/pc`와 같은 배치형이다 — 즉 여기에
  요금이 있었다면 거의 공짜였다. 없어서 못 가져오는 것이지 비싸서 안 가져오는 게 아니다.
- 📌 **경계**: 이 조사는 **객실 선택까지**다. 그 다음(실제 예약·결제 확정)은 몰지 않았다 —
  법인 실계정에 예약을 만들게 된다. 화면의 "★ 스마트요금 적용 객실입니다"라는 안내가
  가리키는 값이 그 뒤에 있을 수 있고, 있다 해도 **거기는 수집 대상이 아니다.**

그리고 이 리조트는 **요금이 나왔더라도 행에 붙일 수 없었다.** `parse.ts:60-66`이
평형·뷰 변형을 한 행으로 접는데, 실측에서 150개 (날짜, 객실유형) 그룹 중 **90개가
2개 이상의 변형을 접고 있고** `rsvRmCnt`는 그중 83개에서 서로 다르다(최대 차이 34).
즉 접힌 행에 "그 방의 값"이라는 건 존재하지 않는다 — 요금을 붙이려면 최저가로 접고
행이 스스로 "부터"라고 말해야 한다. `room/detail`도 `roomTypeNm > viewList > rmTypeList`
3단으로 **변형 단위**라 이 문제를 그대로 물려받는다.

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
npx tsx scripts/debug-sono.ts keys ["지점명"]   # 응답 키 전수 조사 (금액 조사, 잘림 없음)
npx tsx scripts/debug-sono.ts flow ["지점명"]   # 금액 조사 Q2 — 예약 흐름을 객실 선택까지
SONO_FLOW_MANUAL=1 NET_WAIT_MS=180000 npx tsx scripts/debug-sono.ts flow   # 손으로 몰기
```

**`flow` 스텝이 존재하는 이유**: `keys`는 *우리가 읽는 응답*의 키를 전수 조사한다.
그건 "이 응답에 요금이 없다"까지만 답하고, 리솜은 정확히 그 너머에서 뒤집혔다.
`flow`는 홈 위젯부터 객실 선택까지 홉을 걸으며 **이름 필터 없이** JSON을 본문까지
기록하고, 응답마다 **이름과 값을 둘 다** 보는 스캐너를 돌린다 — 이름만 보면 `amt1`
같은 필드를 놓치고, 값만 보면 리솜 `rmAmt`(전부 `"0"`)처럼 이름은 맞고 값이 없는
경우에 속는다. 오크밸리 `probe`·한화 `cal`과 같은 계보의 질문이다:
**"성공한 응답이 옳은 응답은 아니다" → "우리가 읽는 필드가 응답의 전부는 아니다" →
"우리가 읽는 응답이 그 화면의 전부는 아니다."**

주의 둘 — ① 달력에서 **예약 가능한 날짜**를 고를 것. 마감된 날은 누를 것이 없어
"콜이 없다"로 보인다. ② 자동 클릭이 실패하면 그것은 "요금 콜이 없다"의 증거가
**아니다**. 셀렉터를 못 찾은 것과 구별되지 않으므로 `SONO_FLOW_MANUAL=1`로 다시 볼 것.

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

### 요금은 있다. 단 재고 응답이 아니라 객실 하나마다 묻는 별도 콜이다 (금액 조사, 2026-08-24)

`calendarRooms` 엔트리에는 `rmAmt`와 `rentRmAmt`가 **있다.** 그런데 506엔트리 전부
`"0"`이고, 옆에 `rmAmtCd:"O12"` / `rentRmAmtCd:"O20"`라는 요금 코드만 들어 있다.
**필드가 있다고 값이 있는 게 아니다** — 이걸 그대로 읽으면 전 객실을 0원으로 발행한다.

실제 요금은 `GET {apiBase}/roomReservation/stockPrice`가 답한다.

```
{"rmAmtCd":"O12","rmAmtList":[{"oprtYmd":"20260907","rmAmt":252000}],"totalRmAmt":252000,
 "rentRmAmtCd":"O20","rentRmAmtList":[…],"totalRentRmAmt":316000,
 "rmAmtStndNm":"기본","totalCmpnyRmAmt":0,"totalCmpnyRentRmAmt":0,"isPossible":true}
```

- **회원가다.** 화면이 이 값으로 "객실요금 / 회사지원금(`totalCmpnyRmAmt`) /
  임직원 결제 금액(`rmAmt - totalCmpnyRmAmt`)"을 그린다. 다섯 곳 중 제휴 담당자가
  안내할 값에 가장 가까운 숫자다.
- **총액과 밤별 내역을 같이 준다** — `totalRmAmt` + `rmAmtList[]`. 우리가 합산할 필요가 없다.
- **`isWait`와 `rentYn`이 필수다.** 둘 다 달력 엔트리에 없는 필드라, 빼면 400이 나면서
  `"대기예약여부는 필수값입니다"`처럼 빠진 항목을 한국어로 알려준다.
- **예약 가능한 숙박에만 값이 있다.** 같은 방을 2·3박으로 물으면 `isPossible:false`에
  전 금액이 `null`이다. 즉 "요금 없음"과 "예약 불가"가 같은 응답으로 온다.
- ⚠️ **비용이 이 발견의 핵심이다.** SPA는 사용자가 객실을 *클릭할 때* 이 콜을 한 번 한다
  (`RoomReservationView`가 달력 엔트리를 통째로 복사해 `coYmd`만 다시 계산해 보낸다).
  즉 행 하나에 콜 하나이고, 실측 0.2~1.8초다. 3지점 × 객실유형 11종 × 46일이면
  **1,500콜**이라 30초 패스 예산에 들어갈 여지가 없다.
  · 그래서 요금은 **사용자가 "최신화"로 지목한 (지점, 날짜)에만** 붙인다 — 아래 절.
- 📌 **문서 정정**: `debug-resom.ts` 머리말이 번들에서 봤다고 적어둔 `room/price/list`는
  **패키지 예약**(`Wt = "/package"`)의 요금이다. 회원 객실 예약(`ct = "/roomReservation"`)의
  요금 콜은 이름이 아예 다르다(`stockPrice`). 접근자 이름은 양쪽 다 `selectRoomPrice`라
  번들만 보고 고르면 **패키지 요금을 회원 객실 재고 옆에 붙이게 되고, 응답 어디에도
  그렇다고 적혀 있지 않다.**

### 요금 수집은 "최신화" 경로에만 있다 (2026-08-24 구현)

정기 수집은 요금을 **한 번도 묻지 않는다.** 요금이 붙는 것은 조회 화면에서 지점 하나를
고르고 최신화를 눌렀을 때뿐이고, 그때만 감당이 되는 이유는 그 순간이 구조적으로
**지점 1곳 × 윈도우 1개**이기 때문이다(`refreshTarget`은 `sel.property`가 있을 때만
대상을 준다). 실측: 그 날짜의 예약 가능한 행이 3~7개라 콜도 그만큼이다.

- **게이트가 둘이다.** `refresh/route.ts`가 `branch`의 유무로 `SearchParams.withPrices`를
  세우고(관리 화면 버튼은 본문 없이 호출하고 스케줄러는 날짜만 보내므로 이 하나가 세
  경로를 정확히 가른다), `search.ts`가 `withPrices && branches.length === 1`을 다시 본다.
  어긋났을 때의 증상이 항상 **"요금이 안 나옴"(안전)**이고 **"예산 초과"(위험)**가 될 수 없다.
- **예산은 상수가 아니라 `ctx.deadlineAt`에서 유도한다.** `run.ts`가 `searchAvailability`
  전체를 하나의 `withDeadline`으로 감싸므로, 넘기면 잃는 것은 요금이 아니라 **이미 모은
  그 지점 45일치 행 전부와 SUCCESS 판정**이다. 한화·오크밸리의 `passBudgetMs`는 가용성을
  가용성으로 지키니 추정이 허용되지만 여기는 가용성을 부가 정보로 걸게 되므로 안 된다.
  콜당 타임아웃도 `timeouts.api`(30초)가 아니라 `timeouts.price`(5초)다 — 30초짜리 한 콜이
  예산 전체를 무효화한다.
- **요금을 붙이지 않는 조건**(전부 조용히 null, 절대 throw 없음):
  `isPossible !== true` / `totalRmAmt`가 0 이하 / `rmAmtList`가 요청한 숙박과 불일치
  (길이·첫 날짜·합계 3중 검증) / **`totalCmpnyRmAmt !== 0`**. 마지막 것이 중요하다 —
  회사지원금이 붙는 순간 `totalRmAmt`는 직원이 낼 금액이 아니고(사이트는 "임직원 결제
  금액 = 객실요금 − 지원금"을 따로 그린다) 우리는 지원금을 저장하지 않으므로 화면이
  자기가 틀렸다는 걸 알 방법이 없다. 관측 계정은 0이라 이 가지는 지금 무동작이다.
- **`available`인데 `isPossible:false`인 행 수를 로그로 낸다.** 리솜 가용성은 밤별 상태를
  우리가 AND 한 추론이고 `isPossible`은 사이트가 그 숙박 전체에 대해 직접 답한 값이라,
  이 프로젝트가 그 추론을 대조할 수 있는 **첫 기회**다(2박 버그가 두 번 났던 저장소다).
- **요금은 행보다 낡을 수 없다.** upsert가 한 행의 모든 컬럼을 한 문장으로 쓰고
  `DO UPDATE SET`에 `price`가 있으므로 **요금의 나이 = `synced_at`**이다. 그래서 요금
  없이 도는 다음 크롤이 요금을 null로 덮고, 지워지지 않은 낡은 행은 조회 화면의
  `showsPrice(tone)`가 그리지 않는다. **`COALESCE`로 보존하면 안 된다** — 그 순간 요금이
  행보다 늙을 수 있게 되고 신선도 축이 요금에 대해 거짓말을 시작한다.
  · 파급: 한 콜이 45일을 답하므로 `(지점 X, D, N박)` 최신화 한 번이 `지점 X`의
    `[D, D+45)` × `N박` 행의 요금을 전부 null로 만든다. **요금은 최신화의 산물이지
    재고의 속성이 아니다 — 지워지는 것이 정의고 남아 있는 것이 버그다.**

실사이트 검증(2026-08-24):

```
prices 스텝 (포레스트 리솜, 2주 뒤 체크인)
  1박 3행 3.2초 · 2박 2행 2.9초 · 3박 1행 1.8초
  같은 방: 177,000 → 354,000 → 531,000  (정확히 ×N — coYmd가 반영된다는 증거)
run-crawl RESOM "포레스트 리솜"  → 506행 15.4초, pricedRows 7
run-crawl RESOM (전 지점)        → 2,116행 13.7초, pricedRows 0, 그리고 앞의 요금 7건이 null로 지워짐
run-crawl RESOM hot              → 60/60 윈도우 58스킵 4,186행 19.0초, pricedRows 0 (기존 실측과 동일)
run-crawl LOTTE                  → 75행 17.7초 (공용 upsert 회귀 없음)
DB 불변식 위반 0건 (price>0 · price_kind 동반 · available=false에 요금 없음)
```

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
npx tsx scripts/debug-resom.ts keys       # 응답 키 전수 조사 + stockPrice (금액 조사)
npx tsx scripts/debug-resom.ts prices ["지점명"]  # 요금 부착 단독 (1·2·3박 총액 대조)
npx tsx scripts/run-crawl.ts RESOM        # run.ts 전체 경로 (전 지점 → 요금 없음)
npx tsx scripts/run-crawl.ts RESOM "포레스트 리솜"   # 지점 하나 → 요금까지 (최신화 버튼과 같은 경로)
npx tsx scripts/run-crawl.ts RESOM hot    # 핫 윈도우 60개 — 윈도우 스킵을 보는 유일한 방법
```

`doLogin`이 세션을 파일로 남기고 나머지 스텝이 재사용한다. `rows`/`span`은 그 세션에서
크롤러용 쿠키를 만들어 심으므로(`seedCrawlerCookie`) 파서를 고칠 때마다 실계정에
로그인이 쌓이지 않는다 — 반복 로그인 실패는 잠금 위험이라 그렇게 만들었다.

# OAKVALLEY 크롤러 (reservation.oakvalley.co.kr 회원 콘도 예약)

오크밸리(원주, HDC그룹)는 **호스트가 둘**이다. 로그인은 `oakvalley.co.kr`(Vite/React SPA,
`api.oakvalley.co.kr/api/v1/users/sign-in`), 재고는 `reservation.oakvalley.co.kr`
(2012년식 JSP·Tomcat `JSESSIONID`·jQuery 1.7.2)에 있다. 마케팅 사이트의
`/api/v1/village`·`/api/v1/condo`는 공개지만 **재고가 없다** — 인벤토리 API로 착각하지 말 것.

수집 대상은 **회원 콘도 예약(CONDO) 하나**다. 쿠폰·패키지(GRP1/GRP2)·성수기 추첨(rslot)은
다른 상품이라 같은 테이블에 섞으면 "잔여 객실"의 의미가 리조트마다 달라진다(리솜과 같은 판단).

엔드포인트 (2026-08-11 실계정 검증):

```
POST {apiBase}/users/sign-in                    로그인 (폼 조작으로 유발)
GET  {rsvBase}/common.session.pns?sessionCheck  세션 검증 → session[0].session_yn
POST {rsvBase}/frontoffice/condo/c_100.jsp      회원 콘도 예약 화면 (condo_flag=CONDO)
POST {rsvBase}/condo.calendar.pns?getCalendar   잔여 객실 (월 달력)
```

롯데·소노·리솜과 갈리는 지점은 넷이다.

- **브리지를 걸을 필요가 없다.** SPA가 로그인 도중 스스로
  `POST reservation.oakvalley.co.kr/frontMember.pns?login-oak`을 부르고, 그 직후
  네비게이션 없이 `sessionCheck`가 `session_yn:"Y"`를 답한다. 그래서 `login.ts`는 평범한
  폼 로그인이고, JSP 페이지 로드는 로그인이 아니라 **검색**의 일이다(아래 `ptSignature`).
  · 다만 `performLogin`은 sign-in 성공 후 `session_yn`이 `Y`가 될 때까지 **폴링한 뒤**
    반환한다. `run.ts:181`이 `login()` resolve 즉시 `saveStorageState`를 부르므로, 한 박자
    이른 반환은 `oak-token`은 있고 `JSESSIONID`는 없는 상태를 저장하게 되고, 그건 이후
    모든 패스에서 검증 실패로 나타난다.
  · 실패 메시지는 **"토큰을 못 받았다"와 "토큰은 받았는데 session_yn이 N"을 구분**한다.
    후자가 사이트 쪽 핸드오프 문제이고, 구분하지 않으면 비밀번호 오류로 오진한다.
- **`ptSignature` 때문에 요청을 URL로 조립할 수 없다.** JSP의 모든 `<form>`에 서버 생성
  히든 필드가 있고 매 AJAX POST에 `serialize()`돼 들어간다. **실측: 한 번 수확한 서명으로
  4연속 동일 성공** — 서명은 렌더가 아니라 세션+폼에 묶여 있다. 그래서 크롤러는
  패스당 콘도 화면을 **한 번만** 열어 폼 필드를 수확하고, 이후는 평범한
  `page.request.post`로 쏜다(DOM을 몰지 않는다).
- **id와 name이 다르고, 그게 결정적이다.** `c_handler.js`는 필드를 **id**로 다루고
  (`$("#V_T_MONTH")`) `serialize()`는 **name**으로 제출한다(`T_MONTH`). name으로 덮으면
  id가 그대로 남아 폼이 렌더된 달을 계속 제출하고, 달력은 **어느 달을 물어도 8월을 답한다** —
  그것도 `success:true`로, 에러 하나 없이. 조사 중 실제로 여기에 한 번 걸렸다.
  `search.ts`는 오버라이드를 **id로 키잉**하고 전송 시점에 name으로 매핑한다.
- **응답은 월 달력이고 월말 꼬리가 없다.** `entitys[] = {CD_DATE(일자만), AVA_YN,
  RM_RMTYPE, RM_REF1, …}`. 실측: 08 요청 → 11~31일, 09 → 1~30, 10 → 1~31.
  소노는 `nights-1`일 꼬리를 공짜로 받았지만 여기는 **매달 말일이 다음 달 없이는
  판정 불가**다. 그래서 `search.ts`가 두 달을 받아 하나의 `NightMap`에 병합한 뒤에야
  `parse.ts`가 행을 만든다(수집과 조립이 분리된 유일한 크롤러인 이유).
- **`V_IN_BAKSU`(박수)는 재고에 아무 영향이 없다.** 1박·2박·3박 요청의 공통 84건이
  상태까지 전부 동일했다. 그래서 `parse.ts`가 숙박 일수만큼 AND 한다 — 판정할 밤이
  하나라도 없으면 행을 **안 만든다**. (`getCalendar_baksu_check`는 날짜를 클릭한 *뒤*
  최대 연박을 재는 별도 서블릿이고 이것과 다르다. `c_handler.js`는 `V_IN_BAKSU`를
  한 번도 설정하지 않는다.)

그 밖에:

- **`closingSoon`은 항상 false다. 버그가 아니다.** `AVA_YN`의 관측된 알파벳이 정확히
  `{"Y","N"}`이고 페이로드 어디에도 잔여 수가 없다. 롯데는 실제 잔여 수를 임계값으로,
  소노는 사이트의 `E` 코드를 쓰는데 오크밸리는 둘 다 없다 — 네 크롤러에서 이 필드의
  **세 번째 서로 다른 출처**다. 대기(waitlist)는 "예약 불가인 방에 줄을 설 수 있다"는
  다른 질문이라 매핑하면 `available=false` 행에 마감임박 칩이 붙는다.
- **회원권(회원증) 축은 재고에 존재하지 않는다.** 이 계정은 회원권을 5개 보유하는데,
  5개 전부 **그리고 회원권을 아예 안 보낸 경우까지** 두 빌리지 모두 동일한 달력을 답했다.
  회원권 목록은 `<select>`가 아니라 `POST common.bungyangmember.pns?getRoomMember`로
  오지만, 크롤러는 그걸 부를 필요조차 없다. **요청 수를 이 축으로 곱하지 말 것.**
- 지점 2곳 — 밸리 빌리지(`1101`), 힐스 빌리지(`2101`), 둘 다 **강원**.
  `/api/v1/village`의 세 번째 빌리지 `SEONGMUNAN`(성문안)은 전 필드가 `null`인 미출시
  자리표시자라 제외했다.
- **객실 유형의 평형은 실데이터가 정한다.** `RM_RMTYPE` → `RM_REF1`이 두 빌리지 모두
  1:1이고(`{"AP":["031"],…}`), 이것이 유일하게 믿을 수 있는 출처다 —
  `c_handler.js`는 자기 모순이다(`room_type_fx()`는 037→CE·045→DB인데 달력 렌더러는
  CE를 room_45로, DB를 room_37로 그린다). **데이터는 렌더러 쪽이 맞다: DB=37평, CE=45평.**
  1:1이라 `RM_REF1`을 `roomType`에 덧붙일 필요는 없다. 미등록 코드는 추측하지 않고
  코드 그대로 저장하고, `debug-oakvalley.ts diff`가 보고한다.
- 응답 charset은 UTF-8(`application/x-json;charset=UTF-8`), 깨짐 0.
- **봇 보호가 없다**(넷퍼넬·Imperva·CAPTCHA·Cloudflare 흔적 0건). 롯데와 달리 실패하면
  원인은 문지기가 아니라 요청 조립이거나 세션이다.
- JSP는 네이티브 `alert()`를 남발한다. `bootCondo`가 페이지당 1회 다이얼로그 핸들러를
  무장하지 않으면 이후 모든 네비게이션과 `evaluate`가 **영구히 멈추고**, 증상이
  "출력 없이 정지"라 네트워크 지연으로 오독된다.

실사이트 검증(2026-08-11):

- 콜드 로그인 포함 전 지점 1윈도우 **459행 24.2초** — `/api/resorts/[slug]/refresh`의
  50초 예산 안.
- **핫 윈도우 60개 → 58스킵 · 검색 2회 · 달력 요청 4회 · 부팅 1회, 909행 23.2초**
  (세션 재사용). 2박 패스는 `fetched: 0`으로 1박 패스가 받아둔 달력을 그대로 썼다.
- 1박 51일(8/11~9/30) 구멍 0, 2박 50일 — **하루 적은 것이 정상**이다. 9/30의 둘째 밤이
  없어 추측 대신 행을 만들지 않았다.
- 과거 날짜 0행, "2박 가능인데 1박 불가" 모순 0행, `closing_soon` 0행,
  지점·지역 카탈로그 완전 일치, 객실 유형 9종 각 101행.
- 클라이언트 번들 유출 0건(`complexCd`/`ptSignature`/`V_T_MONTH`).

### 요금은 없다 — 그리고 "키를 다 세어봤다"던 기록이 틀렸었다 (금액 조사, 2026-08-24)

`getCalendar` 엔티티의 실제 키는 **14개**다:
`AVA_YN CD_DATE DAYS IMSI_SORT ORI_RM_DATE RM_COMPLEX RM_DATE RM_REF1 RM_RMTYPE
RMTYPE_DESC ROOM_TYPE_CODE ROOM_TYPE_NAME SEC_DIV WEEK_DAY`. 돈은 없고, `entitys2`는
길이 0이며(파서가 `unknown[]`으로 열어두고 안 보던 자리), 콘도 화면이 부르는 다른 JSON은
공지·이벤트·회원권 셋뿐이다.

📌 **정정**: `debug-oakvalley.ts` 머리말은 엔티티 키를 `{CD_DATE, WEEK_DAY, DAYS, AVA_YN,
RM_RMTYPE, RM_REF1}` **6개로 열거**하고 있었다. 결론("잔여 수도 요금도 없다")은 그대로
유지되지만, 그 결론을 떠받치던 열거가 절반이었다. 다섯 리조트 중 유일하게 "전수 열거가
있어서 단정 가능"하다고 믿었던 곳이 이곳이었다는 점이 이 조사의 교훈이다 —
**세어본 적 없는 목록은 목록처럼 보여도 목록이 아니다.**
(부수 소득: `RMTYPE_DESC`가 "31타입"·"노스48타입"을, `SEC_DIV`가 동을 이미 답하고 있다.
`OAKVALLEY.roomTypes`의 하드코딩과 대조해볼 만한 자리다.)

## 로컬 검증

```bash
npx tsx scripts/debug-oakvalley.ts main        # 진입점 · 아웃바운드 호스트
npx tsx scripts/debug-oakvalley.ts login       # 로그인 폼 (로그인하지 않음)
npx tsx scripts/debug-oakvalley.ts doLogin     # 실로그인 → 토큰·쿠키 도메인·session_yn
npx tsx scripts/debug-oakvalley.ts bridge      # SPA→JSP 홉별 session_yn · 폼 필드 · 회원권
npx tsx scripts/debug-oakvalley.ts session     # JSESSIONID TTL 폴링
npx tsx scripts/debug-oakvalley.ts cal         # getCalendar 2방식 대조 + 서명 재사용 ×3
npx tsx scripts/debug-oakvalley.ts probe       # 어떤 오버라이드가 실제로 먹는가
npx tsx scripts/debug-oakvalley.ts span        # 달 범위 · 박수 무영향 · 월 경계 연속성
npx tsx scripts/debug-oakvalley.ts memberships # 회원권이 달력을 바꾸는가
npx tsx scripts/debug-oakvalley.ts rows        # search+parse 단독 실행
npx tsx scripts/debug-oakvalley.ts diff        # 지점·객실유형 ↔ OAKVALLEY config 대조
npx tsx scripts/debug-oakvalley.ts keys        # 응답 키 전수 조사 (금액 조사)
npx tsx scripts/run-crawl.ts OAKVALLEY hot     # 핫 윈도우 60개 — 윈도우 스킵을 보는 유일한 방법
```

`doLogin`만 실계정을 쓰고 나머지는 `/tmp/oakvalley-debug-state.json`을 재사용한다.
리솜의 `seedCrawlerCookie` 같은 변환은 필요 없다 — 오크밸리 인증은 평범한 컨텍스트
쿠키라 저장된 상태가 그대로 크롤러가 원하는 것이다.

**`probe` 스텝이 존재하는 이유**: `ptSignature`가 붙어 있으면 "요청이 성공했다"가
"요청이 반영됐다"의 증거가 되지 못한다. 서명된 필드는 조용히 원래 값으로 되돌아갈 수
있고, 그 결과는 에러가 아니라 **틀린 달의 정답**이다. 한 번에 한 필드씩 바꿔 무엇이
움직이는지 보는 것이 유일한 판별법이다.

# HANWHA 크롤러 (booking.hanwharesort.co.kr 회원 객실 예약)

한화리조트는 **호스트가 둘**이다. 로그인은 `www.hanwharesort.co.kr`(JSP/JEUS,
`/irsweb/resort3/**.do`), 재고는 `booking.hanwharesort.co.kr`(별개 JEUS 앱)에 있고
예약 쪽 모든 질문이 **범용 게이트웨이 한 곳**을 통한다:
`POST /rst/cmn/doExecute.mvc`에 `ds=<JSON>`을 urlencoded로 보내고, 어떤 서비스가
도는지는 본문의 `serviceInfo.INTF_ID`가 정한다.

수집 대상은 **회원 객실 예약 하나**다. 추첨·패키지·쿠폰·조식·테마파크는 다른 상품이라
같은 테이블에 섞으면 "잔여 객실"의 의미가 리조트마다 달라진다(리솜·오크밸리와 같은 판단).

엔드포인트 (2026-08-13 실계정 검증):

```
POST www…/irsweb/resort3/member/login.do                     로그인 1/2 (#id · #pwd)
POST www…/irsweb/resort3/member/login_membership_password.do 로그인 2/2 (회원인증)
POST www…/irsweb/resort3/sessionCheck.do                     세션 검증 → { resultCode }
GET  booking…/rst/msi/0010/serviceM01.mvc                    예약 호스트 세션 부팅 → sCustNo
POST booking…/rst/cmn/doExecute.mvc                          지점 목록 / 잔여 객실
POST booking…/rst/cmn/getCmnCode.mvc                         공통코드(상태 코드표)
```

기존 넷과 갈리는 지점은 넷이다.

- **로그인이 두 화면이고, 첫 화면만으로는 아무것도 서지 않는다.** 아이디/비밀번호를
  넣으면 사이트가 스스로 `login_membership_password.do`로 넘어가 **회원권 비밀번호**를
  요구한다. `sessionCheck.do`는 그 전까지 `resultCode: -1`, 통과 후 `0`이다.
  · 그 두 번째 비밀값은 `ResortAccount.memo`에서 온다 — 이것 때문에
    `CrawlerContext.credentials`에 `memo?: string`이 생겼고, 리조트를 세 번 늘리는
    동안 무수정이던 `run.ts`·`types.ts`가 처음 바뀌었다. **`memo`는 암호화되지 않고
    `/admin/accounts` 표에 그대로 렌더링된다** — `idEncrypted`/`pwEncrypted`와 등급이
    다르다는 사실이 두 파일의 주석에 남아 있다.
  · `performLogin`은 단발 확인이 아니라 **폴링**한다. 실측에서 1회차가 `-1`,
    2회차가 `0`이었다 — `run.ts`가 `login()` resolve 즉시 `saveStorageState`를 부르므로
    한 박자 이른 반환은 "화면 1은 통과, 화면 2는 아님"인 세션을 저장하고, 그건 이후
    모든 패스에서 만료된 세션과 똑같이 보인다.
  · 실패는 **네 갈래로 구분**한다 — 로그인 폼이 아예 안 뜸 / 회원인증 화면에 닿지도
    못함(자격증명 또는 대기열) / 회원인증에서 거부(회원권 비밀번호) / 통과했는데
    `resultCode`가 안 됨(사이트). 안 나누면 넷 다 "비밀번호 오류"로 읽힌다.
  · ⚠️ **폼이 없다는 것은 실패가 아니다 — 이미 로그인돼 있으면 사이트가 로그인 화면을
    그리지 않는다.** 그러면 `#id`는 영원히 나타나지 않고, 25초를 기다린 끝에 나오는
    것은 자격증명 오류와 구별되지 않는 `locator.waitFor: Timeout 25000ms`다.
    **2026-08-25 09:02:47과 08-26 09:03:04의 프로덕션 실패가 정확히 이것이다** —
    둘 다 `checkLoggedIn`이 (사이트의 답이 아니라 전송 실패로) false를 냈고, `run.ts`가
    그것을 만료로 읽어 로그인을 시켰고, **멀쩡한 세션 위에서** 로그인 화면을 기다리다
    죽었다. 즉 이 크롤러는 자기가 이미 통과한 상태를 실패로 신고하고 있었다.
    이제 폼이 없으면 `sessionCheck.do`를 먼저 물어보고, 이미 인증돼 있으면 조용히
    반환한다. (`SESSION_LOST` 회복 경로도 같은 자리로 온다 — 거기서 필요한 것은 `www`
    재인증이 아니라 `bootSession`의 재시도이고, 그건 이 함수가 반환한 **뒤**에 있다.)
  · **`checkLoggedIn`은 "아니오"와 "모르겠다"를 구분한다.** `resultCode`를 받은 경우는
    사이트의 확정 답이라 재시도하지 않는다(특히 `-1` = 화면1만 통과). 비2xx와 예외는
    세션에 대해 **아무 말도 하지 않은 것**이라 1초 뒤 1회만 다시 묻는다. 이 구분이
    필요한 이유는 값의 비대칭이다 — 여기서 false 하나의 값이 **2화면 콜드 로그인**이다.
    (08-26에 09:05:13분 만든 세션이 이후 90초 넘게 세 패스를 버텼다. 70초 전 세션이
    false를 받은 것은 만료가 아니었다.)
  · 회원권 비밀번호가 **미설정인 계정은 화면 2가 아예 안 뜨고** 바로 로그인된다
    (사이트 안내문 그대로). 그 경우도 성공으로 처리한다.
  · **회원인증 페이지 HTML을 덤프하지 말 것.** 그 화면은 `cyber_id`와 `password`를
    히든 필드로 되돌려 보낸다 — 저장하면 평문 자격증명을 디스크에 쓰는 것이다.
    `login.ts`와 `debug-hanwha.ts` 둘 다 스크린샷만 남긴다.
- **예약 호스트는 세션을 자동으로 물려받지 않는다.** 로그인한 채로 잔여객실조회로
  곧장 가면 `sCustNo=""`, `sContYn="N"`으로 **익명**이고, 에러가 아니라 그냥 일반
  뷰가 나온다. 예약 호스트 자기 페이지를 한 번 열어야 그 앱의 세션이 선다.
  `search.ts`의 `bootSession`이 `msi/0010`을 열고 `sCustNo`를 읽는다 —
  **`CUST_NO`는 계정마다 다르므로 config에 박지 않는다**(소노의 `memNo`와 같은 이유).
  · **그래서 `validateSession`은 두 호스트를 둘 다 묻는다** (2026-08-26).
    `checkLoggedIn`(`www`의 `sessionCheck.do`)만 보던 시절에는 그 통과가 크롤 가능을
    뜻하지 않았다 — 세션을 잃는 쪽은 `booking`이고, 그 상실은 크롤 한복판에서야
    `SessionLostError`로 드러났다. 이제 `index.ts`가 `bootSession`도 부른다.
    · **공짜다.** `booted`가 `ctx.page`로 키잉된 WeakMap이라 검증에서 부팅한 결과를
      같은 패스의 `performSearch`가 그대로 재사용한다 — 네비게이션이 **늘지 않고
      앞당겨질 뿐**이다(실측: 부팅 로그가 패스당 한 번).
    · 타임아웃은 `navigation`(25초)이 아니라 `timeouts.validateBoot`(10초)다.
      예약 호스트가 넷퍼넬 대기열에 걸리면 증상이 에러가 아니라 **응답 없음**이라,
      검증 하나가 패스 예산을 갉아먹는다. 검증이 실패하면 어차피 로그인으로 가고
      로그인도 이 호스트를 다시 세우므로, 여기서 오래 기다려 얻는 것이 없다.
    · 절대 throw하지 않는다 — `run.ts`가 이 호출을 deadline으로 감싸므로 새어 나간
      예외는 로그인 시도조차 없이 패스를 죽인다.
    · 오크밸리도 같은 모양(호스트 둘, 검사 하나)이지만 아직 손대지 않았다.
  · `bootSession`이 던지는 것은 평범한 `Error`가 아니라 **`SessionLostError`**
    (`_shared/errors.ts`)여야 한다. `run.ts`는 이 예외를 보고 캐시된 storageState를
    버린다 — stage로만 판정하던 시절에는 이 실패가 `SEARCH`라 세션이 그대로 남았고,
    다음 시도가 `validateSession`을 통과해 로그인을 건너뛰고 **똑같이 실패**했다.
    2026-08-25 09:05:10과 09:05:45의 2연속 `SESSION_LOST`가 정확히 그것이다.
- **`RSRV_CLDR_CL_CD`가 회원 뷰를 여는 유일한 축이다.** 설악 45일 실측:
  `01`(회원) → 예약가능 422 / 대기예약 223 / 예약마감 45,
  `02`(일반) → 회원우선 408 / 예약마감 268 / 예약가능 14. 631칸이 달라진다.
  `CONT_NO`·`MEMB_MAST_NO`는 이 계정에서 빈 값이고 값을 넣어도 안 넣어도 같았다.
  `RSRV_ROOM_CNT`도 재고에 **무영향**(1·2·3 요청의 690칸 전부 동일).
- **`STRT_DATE`~`END_DATE`를 문자 그대로, 양끝 포함으로 지킨다.** +30/+31/+45/+60일
  요청이 각각 31/32/46/61일로 돌아왔고 **월 경계 구멍 0**. 그래서 지점당 한 콜로
  핫 윈도우 전체가 덮인다(리솜과 같은 모양). 캐시 키는 요청이 아니라 **덮은 범위**라,
  첫 윈도우가 받아둔 달력을 이후 59개 윈도우가 그대로 쓴다.

그 밖에:

- **`available`은 상태 코드로, `closingSoon`은 잔여 수로 판정한다.** `RSRV_POSBL_CNT`는
  예약가능 행에서 진짜 잔여 수지만 **불가 행에서는 음수**로 나온다(450행 중 68건).
  실측 불변식: **예약가능(0101)이 아닌데 잔여>0인 행은 0건.** 그래서 가능 여부는
  `RSRV_CLDR_RSLT_CD ∈ {0101, 0119}`로, 마감임박은 그 뒤에 잔여 ≤ 2로 본다 —
  다섯 크롤러에서 이 필드의 **네 번째 서로 다른 출처**다.
- 상태 코드표는 추측하지 않고 사이트에서 받는다(`getCmnCode.mvc`,
  `GRP_CD=RSRV_CLDR_RSLT_CD`). `0102~0107`·`0118`은 **추첨**, `0108`은 **대기예약** —
  둘 다 예약가능이 아니다. 대기를 가능으로 치면 못 자는 방을 보고 차를 몰게 된다.
- **`BRCH_CD`와 `LOC_CD`는 다른 값이고 쌍으로 보내야 한다.** 조사 중 제주를
  `1101/1101`(정답 `1100/1101`)로 물었더니 **에러 없이 200에 0행**이 돌아왔다.
  그 침묵이 만실·크롤 실패와 구분되지 않아서 `search.ts`가 0행을 로그로 크게 남기고
  `debug-hanwha.ts diff`가 16지점 전부를 매번 재확인한다.
- 지점 16곳(리조트 12 + 호텔 4). `region`은 사이트 주소(`전라남도`/`강원특별자치도`
  혼재)가 아니라 **2글자 광역**으로 정규화한다. **더플라자 호텔 때문에 `REGION_ORDER`에
  `서울`이 추가됐다** — 네 리조트까지 이 목록은 전부 휴양지였다.
- `roomType`은 응답의 `ROOM_TYPE_NM`. 이름이 없는 엔티티는 코드 그대로 저장하고
  `diff`가 보고한다(추측하면 upsert 유니크 키가 갈라진다).
- **봇 보호**: 로그인 호스트에는 없다. 예약 호스트가 넷퍼넬(`netfunnel.js`,
  `POST /rst/cmn/netKeyChk.mvc`)을 싣고 두 호스트에 F5 BIG-IP ASM 쿠키(`TS*`)가 깔린다.
  이번 조사에서 대기열에 걸린 적은 없다. 걸리면 증상은 에러가 아니라 **응답 없음**이다.
  · **다만 한국 밖에서는 연결 자체가 거부된다.** Vercel `iad1`에서 로그인 호스트로
    `page.goto` 하면 `net::ERR_CONNECTION_RESET`이다 — 봇 판정 이전, TCP 단계다.
    이것 때문에 함수 리전을 `icn1`(서울)로 옮겼다(`CLAUDE.md`의 "배포" 절).

## 패스 예산은 `ctx.deadlineAt`에서 온다 (상수가 아니다)

`HANWHA.passBudgetMs`(30초)와 오크밸리의 같은 상수는 이제 **상한**일 뿐이고, 실제
예산은 `min(passBudgetMs, ctx.deadlineAt - startedAt - RETURN_RESERVE_MS)`다
(2026-08-26).

상수 하나로 추정하면 시계가 둘이 되고, **둘이 어긋나는 방향이 나쁘다.** 내부 시계는
30초까지 달릴 권한이 있다고 믿는데 `run.ts`는 검색 전체를 `withDeadline`으로 감싸고,
그 한계는 콜드 로그인 패스에서 20초대까지 내려간다(브라우저 기동 + 2화면 로그인이
같은 예산에서 먼저 나간다). 잘리면 `DeadlineExceeded`가 나고 — 이 루프가 부분 반환으로
지키려던 — **행 전부와 SUCCESS 판정이 함께 버려진다.** 08-26까지 안 터진 건 운이다.

`ctx.deadlineAt`은 **패스의 끝이 아니라 그 검색이 잘리는 시각**이고 윈도우마다
갱신된다. 리솜 요금 수집이 쓰는 그 시계와 같은 것이다.

## 예산이 끊긴 윈도우는 `stay`를 지우는 게 아니라 **좁힌다**

지점이 16곳이라 **첫 윈도우는 예산(30초)에 걸리는 것이 정상**이다. 실측: 13지점
24초에서 중단. 이때의 처리가 이 크롤러가 새로 가져온 규칙이고, 처음 쓴 방식은 틀렸다.

- `stay`가 붙은 행은 `run.ts`가 "이 범위를 전부 답했다"로 읽고 그 윈도우들을 패스 내내
  스킵한다. 못 돈 지점이 있는데 그대로 두면 **루프 순서가 고정이라 매 패스 같은 지점이
  영영 수집되지 않는다.**
- 그렇다고 **`stay`를 지우면 안 된다.** 46개 체크인 날짜가 전부 요청 윈도우 아래로
  들어가고, upsert 중복 제거 키(지점+객실유형+날짜)가 그걸 한 날짜로 뭉갠다.
  실측으로 **5,520행이 120행이 되고, 남은 행은 미래 어느 날의 상태를 오늘 것이라고
  주장**했다. 조용히 틀린 데이터다.
- 정답은 **요청받은 숙박만 남기고 나머지를 버리는 것**. 영구 손실이 아니다 —
  다음 윈도우가 캐시된 달력에서 공짜로 다시 만들어 온전히 스탬프한다.

실사이트 검증(2026-08-13, `run-crawl.ts HANWHA hot`):

```
윈도우 1: 13지점 fetch → 예산 초과 → 5,520행 중 120행만(요청 숙박)
윈도우 2: 16지점 (3 fetch + 13 cache) → 6,480행, 온전히 스탬프
윈도우 3: 16지점 (0 fetch + 16 cache) → 6,624행
결과: 60/60 윈도우 · 57스킵 · 요청 16번 · 13,224행 · 35.6초
```

- 콜드 로그인 포함 단일 윈도우 32.1초 — `/api/resorts/[slug]/refresh`의 50초 예산 안.
- 1박 46일 / 2박 45일 — **하루 적은 것이 정상**(마지막 날의 둘째 밤이 범위 밖이라
  추측 대신 행을 만들지 않았다). 과거 날짜 0행, "2박 가능인데 1박 불가" 모순 0행,
  `closing_soon`이 `available=false`에 붙은 행 0건.
- 지점 16곳·지역 9곳 카탈로그 완전 일치, 객실유형 107종, 지점명 충돌 0
  (전체 5개 리조트 57지점에서도 0).
- 클라이언트 번들 유출 0건(`brchCd`/`locCd`/`TFO00HBS`/`RSRV_CLDR`/`doExecute`).

### 요금은 없다 — 시즌과 할인율만 있다 (금액 조사, 2026-08-24)

`ds_result` 한 행은 키 **18개**이고 그중 금액은 없다:
`ALLC_ROOM_CNT BRCH_CD LOC_CD MSG PP_DSCNT_RT ROOM_TYPE_CD ROOM_TYPE_NM RSRV_CLDR_RSLT_CD
RSRV_LOC_DIV_CD RSRV_POSBL_CNT RSRV_POSBL_YN SESN_CD SESN_DATE SESN_NM SORT_SEQ
USER_CALC_GRAD_CD WAIT_POSBL_CNT WAIT_SEQ`.

가장 요금에 가까운 둘은 **요금이 아니다** — `PP_DSCNT_RT`는 할인율(관측 0·2·10)이고
`SESN_NM`은 시즌 이름("가을 비수기 준주말")이다. 즉 사이트는 요금을 결정하는 축은
알려주면서 결정된 값은 이 응답에 싣지 않는다.

**이 사이트에서 Q2는 URL 문제가 아니다.** 모든 예약 질문이 `doExecute.mvc` 하나를 지나고
`serviceInfo.INTF_ID`가 어느 서비스를 돌릴지 정하므로, 요금 서비스가 있다면 다른 URL이
아니라 다른 INTF_ID로 나타난다. 잔여객실조회 화면이 실제로 부르는 서비스는 5개이고
(`ITSCTM0160` `ITSCTM9000` `REMPRR0120` `SLESTA0604` `REMPRR0113`), **우리가 부르는
`REMPRR0113`을 뺀 넷은 요청이 `CORP_CD`/`CUST_NO`뿐이다** — 날짜도 지점도 객실유형도 묻지
않으므로 숙박 요금을 답할 수 있는 서비스가 아니다. 요금은 이 화면보다 뒤(실제 예약 단계)에
있고, 거기는 수집 대상이 아니다.

## 로컬 검증

```bash
npx tsx scripts/debug-hanwha.ts main       # 진입점 · 아웃바운드 호스트 · 예약 진입점
npx tsx scripts/debug-hanwha.ts login      # 로그인 폼 (로그인하지 않음)
npx tsx scripts/debug-hanwha.ts doLogin    # 실로그인 2단계 → 쿠키 · sessionCheck
npx tsx scripts/debug-hanwha.ts bridge     # www→booking 홉별로 sCustNo가 언제 생기나
npx tsx scripts/debug-hanwha.ts session    # 세션 TTL 폴링
npx tsx scripts/debug-hanwha.ts cal        # 회원 화면의 실제 요청 ↔ 우리 config 필드 대조
npx tsx scripts/debug-hanwha.ts span       # 범위 · 월 경계 · 객실수 무영향 · 회원/일반 분리
npx tsx scripts/debug-hanwha.ts rows       # search+parse 단독 실행
npx tsx scripts/debug-hanwha.ts diff       # 지점 16곳 · 지역 · 객실유형 ↔ config 대조
npx tsx scripts/debug-hanwha.ts keys       # 응답 키 전수 조사 + 게이트웨이 서비스 목록 (금액 조사)
npx tsx scripts/run-crawl.ts HANWHA hot    # 핫 윈도우 60개 — 윈도우 스킵을 보는 유일한 방법
CRAWL_BUDGET_MS=50000 npx tsx scripts/run-crawl.ts HANWHA hot   # 프로덕션 예산으로
```

`doLogin`만 실계정을 쓰고 나머지는 `/tmp/hanwha-debug-state.json`을 재사용한다.

**`CRAWL_BUDGET_MS`가 필요한 이유**: `run-crawl.ts`의 `hot` 경로는 기본 300초를 쓴다.
조사용으로는 옳지만, 그 아래에서는 **예산 산술이 한 번도 실행되지 않는다** — 검색/쓰기
분리 예약도, 부분 반환도, `stay` 좁히기도 전부 안 도는 코드다. 프로덕션이 실제로 타는
경로를 보려면 50,000으로 돌릴 것. 그때 볼 것은 행 수가 아니라 **패스별 `durationMs`가
58초를 넘지 않는가**다(`maxDuration`이 60초이고, 넘으면 `crawl_logs` 행이 RUNNING으로
남는다).

**`cal` 스텝이 존재하는 이유**: 이 사이트는 틀린 요청에 에러로 답하지 않는다.
`BRCH_CD`/`LOC_CD` 쌍이 어긋나면 **200에 0행**, `RSRV_CLDR_CL_CD`가 틀리면 **가득 찬,
그럴듯한, 틀린 달력**이다. 그래서 "우리 요청이 성공했다"가 "사이트와 같은 질문을 했다"의
증거가 되지 못한다. 유일한 판별법은 회원 화면이 스스로 쏘는 요청을 녹화해 필드 단위로
대조하는 것이고, `cal`이 그걸 한다(2026-08-13 기준 `only theirs`·`only ours`·`differing`
전부 0). 오크밸리 `probe`와 같은 이유에서 나온 다른 형태의 스텝이다.

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성.
   가장 가까운 것을 복사한다 — 지점마다 한 콜이면 **lotte**, 한 콜에 여러 지점이면
   **sono**, 응답이 날짜 달력이거나 API가 쿠키가 아니라 토큰을 요구하면 **resom**,
   요청을 URL로 조립할 수 없거나(서명·토큰이 페이지에 있음) 응답이 월 단위라
   여러 응답을 병합해야 하면 **oakvalley**, 로그인이 화면 여러 개거나 지점이 많아
   한 패스에 다 못 도는 규모면 **hanwha**.
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. `src/lib/resort-catalog.ts`의 `CATALOG`에 `{ properties }` 1항목 추가 —
   지점의 `branchName`/`label`/`region`만 뽑는다. **`bizCd` 등 크롤 전용 필드는 넣지 않는다**
   (이 모듈은 `server-only`지만, 넣으면 서버 컴포넌트가 클라이언트로 내려보내게 된다).
4. `/admin/accounts`에서 해당 리조트 자격증명 등록 (없으면 `run.ts`가 throw)
5. `npx tsx scripts/set-active.ts <SLUG> true`

핵심 코드(`run.ts`, `_shared/*`)는 물론 **Inngest 함수·조회 UI·`/api/inventory`도 무수정**이다.
`crawl-resort`는 slug를 인자로 받는 단일 함수이고(리조트별 함수가 아니다),
`scheduled-refresh`가 `listCrawlableResorts()`(= `active` ∩ 등록된 크롤러)로 팬아웃한다.

**세션이 죽은 것을 알아챘을 때는 `SessionLostError`(`_shared/errors.ts`)를 던질 것.**
평범한 `Error`를 던지면 `run.ts`가 그것을 검색 실패로 읽어 **캐시된 storageState를
그대로 남기고**, 다음 시도가 `validateSession`을 통과해 로그인을 건너뛰고 같은 실패를
반복한다. 반대로 제대로 던지면 `run.ts`가 **그 패스 안에서 1회 회복**한다 — 세션 폐기
→ 재로그인 → 같은 윈도우 재시도. 세션을 잃었을 때 필요한 것은 로그인 한 번이지
브라우저 한 벌이 아니고, 재시도에 맡기면 그 브라우저를 **더 마른 `/tmp`에** 띄우게
된다(2026-08-26 09:07이 그 청구서다). 다섯 크롤러 전부 그 자리가 있다 — 토큰이 없거나(리솜), 회원번호를 못 받거나
(소노), 로그인 화면으로 튕기거나(오크밸리), 재고 호스트가 우리를 모르는(한화) 순간이다.
**로그인 호스트와 재고 호스트가 다르면 이건 선택이 아니다**: `validateSession`이 보는
호스트와 세션을 잃는 호스트가 달라서, 검증 통과가 크롤 가능을 뜻하지 않는다.

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
- **예산이 끊겨 지점을 다 못 돌았으면 `stay`를 지우지 말고 요청 윈도우로 좁혀라.**
  `stay`를 지우면 응답이 덮은 날짜가 전부 요청 윈도우 아래로 들어가고, upsert 중복
  제거가 그걸 한 날짜로 뭉갠다 — 한화에서 5,520행이 120행이 되고 남은 행이 미래
  날짜의 상태를 오늘 것으로 주장했다. 반대로 `stay`를 그대로 두면 못 돈 지점 몫까지
  윈도우가 스킵되고, 루프 순서가 고정이라 같은 지점이 매번 빠진다. 상세는 위 HANWHA 절.

행 수가 크게 늘 수 있다는 것도 염두에 둘 것. `upsertInventory`는 다중행 INSERT 한
문장이라 Postgres의 바인드 파라미터 상한 65,535(행당 12개)에 걸린다 —
`UPSERT_CHUNK_ROWS`로 1,000행씩 끊는다. 소노 한 콜이 ~3,900행이다.

## 어제 있었고 오늘 응답에 없는 행

위 절은 **행을 만들지 않는 규칙**만 말한다. 이미 있던 행이 어떻게 되는지는 오래 말하지
않았고, 그 침묵이 13일짜리 유령을 만들었다 — 2026-08-24 롯데 속초 8/24→8/25에서 16행은
그날 갱신됐는데 호텔 객실 3종만 08-11의 `available=true`를 단 채 남아 조회 화면 맨 위에
초록 배지로 떠 있었다. 실제 사이트에는 그 방이 없었다.

쓰기 경로가 순수 upsert(`ON CONFLICT DO UPDATE`)라서 **응답에 없던 키는 아무도 건드리지
않는다.** 그래서 `run.ts`의 `removeVanishedRows`가 upsert 직후에 그것을 지운다.

- 판정 단위는 `(지점, 체크인, 체크아웃)` 그룹. 규칙은 하나다 —
  **그 그룹에서 1행 이상 받았다면 사이트가 그 지점·그 날짜에 대해 답한 것**이고,
  그 답에 없는 객실은 지금 예약할 수 없다.
- **0행 그룹은 절대 건드리지 않는다.** 그룹 목록을 방금 쓴 행에서 뽑으므로 자동으로
  보장된다. 이게 이 함수의 전부다 — 지점 단위 실패는 조용히 0행이 되는데
  (`lotte/search.ts`가 예외를 삼키고 계속한다) 그걸 "전부 마감"으로 읽으면 크롤 실패가
  **"전 객실 매진"으로 발행**된다.
- **새 크롤러가 지점 루프에서 예외를 삼킨다면 이 규칙에 기대고 있는 것이다.** 삼킨 지점이
  0행이 되어 그룹에 오르지 않기 때문에 안전하다. 반대로 "실패한 지점도 빈 행 목록을
  만들어 둔다"는 식의 구현을 하면 그 순간 크롤 실패가 매진이 된다.
- 마킹이 아니라 삭제인 이유: 사라진 행에는 "예약 불가"와 "판정 못 함"이 섞여 있다
  (소노·리솜·오크밸리·한화는 밤 하나가 결측이면 행을 만들지 않는다). 판정할 수 없으면
  행을 만들지 않는다는 이 문서의 규약과 삭제가 같은 말이다. 지워진 자리는 조회에서
  "데이터 없음"이고, 다음 크롤이 답을 받으면 그대로 복구된다.

그리고 지워지지 않은 낡은 행은 **조회 화면이 등급을 낮춰서** 처리한다 —
`src/lib/freshness.ts`가 나이를 판정하고 3일이 넘은 "예약 가능"은 `unverified`
("N일 전 확인")로 내려간다. 즉 크롤러가 못 지운 유령은 화면이 한 번 더 거른다.
새 크롤러를 붙일 때 이 두 층을 모두 신뢰해도 되지만, **아래층(삭제)을 무력화하는
구현은 하지 말 것** — 위층은 나이만 알 뿐 "사이트가 뭐라 답했는지"는 모른다.
