> `AGENTS.md`에서 옮긴 문서다(2026-10-01, 지침 파일 150k자 한도). 내용은 그대로이고,
> `CLAUDE.md`·코드 주석이 "`AGENTS.md`의 RESOM 크롤러 절"이라 부르는 곳이 여기다.
> 자동 로드되지 않으므로 이 크롤러를 만질 때 직접 읽을 것.

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

### 인원은 있다 — 그리고 **이름이 비슷한 죽은 칸이 바로 옆에 있다** (2026-08-31)

`calendarRooms` 엔트리에 `initPersCnt`(기준인원)와 `maxPersCnt`(최대인원)가 있다.
**이미 부르고 있는 응답 안이라 추가 호출이 0**이고, 그래서 롯데처럼 정기 수집에서 붙는다.

실측(포레스트 리솜, 506엔트리): `initPersCnt {"2","5"}` · `maxPersCnt {"4","6","7"}`,
결측 0건. 전 지점 크롤에서 2,116행 전부 부착, `max < std` 0건.

⚠️ **`allCondos[].roomTypeList[]`에는 `initPersCount`/`maxPersCount`가 있고, 17엔트리
전부 `0`이다.** `Count` ↔ `Cnt` 한 글자 차이이고 **정원의 1순위 후보로 지목돼 있던
바로 그 배열**이다(`CLAUDE.md`가 그렇게 적고 있었다). 그쪽을 배선했다면 에러 없이
전 객실이 0명으로 발행됐을 것이다 — `rmAmt`가 506엔트리 전부 `"0"`이던 것과 같은 함정이
같은 리조트에서 두 번째다. 가드(`_shared/occupancy.ts`의 `< 1` 거르기)가 그걸 막는다.

- 정원은 날짜가 아니라 **방**의 속성이라 `parse.ts`가 달력 밖의 `occupancies` 맵에 모으고,
  같은 객실유형의 엔트리들이 **서로 다른 값을 주면 붙이지 않는다**(실측 불일치 0건).
- 요금과 달리 `available`을 보지 않는다 — 계약(`InventoryRow.occupancy`)의 비대칭이다.

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
