# 켄싱턴 크롤러 (2026-10-18)

`www.kensington.co.kr` 한 호스트. 이랜드파크 운영. 조사 도구는 `scripts/debug-kensington.ts`.

| 항목 | 값 |
| --- | --- |
| 로그인 | **무기명(법인) 회원** `/member/login_corp/` — 일반 회원 로그인이 아니다 |
| 예약 경로 | **분양회원 빠른예약** `/reservation/quick_member` (로그인 시에만 메뉴가 생긴다) |
| 재고 콜 | `GET /reservation/quick_roomdata_member/?…&pay_type=D&memb_no=<분양회원번호>` → HTML 조각 |
| 지점 | 10곳(아래 표). 지점마다 1콜 — 롯데형 |
| 요금 | `member` — `quick_set_summary`(방마다 1콜), **최신화 전용**(아래 "요금") |
| 인원 | 기준·최대 — 무인증 `popup_room_info`, 정기 수집에서도 붙는다(아래 "인원") |
| `stay` | 없음 — 요청 윈도우만 답한다 |

## 로그인

`login_corp.js`가 `#frm_corp`(`corp_id`/`corp_pw`)를 `POST /proc/login_corp_result`로 보내고
JSON `{com_yn:"Y", ret_url:"/"}`를 받는다. 실패는 `com_yn≠"Y"`, 403은 "회원관리팀 문의"(계정 차단으로 추정).
2화면·캡차·약관 강제 없음. 쿠키 이름에 세션 표지가 따로 보이지 않는다(`khrf`, `tk_*` 등).

- 사이트의 `login_corp()`를 그대로 부르면 **성공 시 즉시 `location.href` 이동**이라 응답 본문을
  읽기 전에 리소스가 사라진다(`Network.getResponseBody: No resource…`, 실측). 그래서 크롤러는
  폼 값을 채운 뒤 **같은 요청을 페이지 안 `fetch`로** 보내 JSON을 직접 읽는다.
- 로그인한 계정은 사이트에서 **분양회원**으로 취급된다. 홈의 예약 버튼이
  `/reservation/search` → `/reservation/search_member`로 바뀌고 `quick_member`·마이페이지·분양정보가 생긴다.

## 신원은 일반 예약 응답을 바꾸지 않는다 — 별도 경로가 있다

`member` 스텝(설악비치, 같은 요청을 익명/법인 세션으로): `quick_roomdata`는 **바이트 단위로 동일**.
요금 플랜(`quick_roomdata_subpack`)도 마크업 외 내용이 같다. `quick` 페이지 자체도 `webId` 하나만 다르다.
→ 회원 요금·회원 재고는 일반 `quick`이 아니라 **`quick_member` 경로**에 있다.

`quick_member.js`:
- 분양회원번호 선택(`membno_select(short, full)`, 페이지에 인라인) → `POST /reservation/membno_select {membNo}`
  → 그 회원권으로 예약 가능한 지점 목록(`branCd, branNm, resortDiv, sortSeq`).
- 리조트 지점(`R*`, 그리고 `GKT01`)은 `quick_roomdata_member`(+ `pay_type=D`, `memb_no=<full>`),
  호텔(`H*`)은 일반 `quick_roomdata`(`pay_type=P`)로 분기한다.
- `membno_select`/`branch_select`를 먼저 부르지 않아도 `quick_roomdata_member`는 답한다(서버 상태 없음, 실측).

실측 대조(설악비치 2026-11-01 1박, 같은 9개 유형): 일반 129,900 → **회원 109,000** (스튜디오 오션뷰) 등 전 유형 하락.

### 분양회원번호

이 계정에는 번호가 **둘** 있고(`017-xxxxx`, full은 `-01` 접미), 둘의 지점 목록과 재고 응답이 같다.
크롤러는 **매 패스 `quick_member` 페이지에서 첫 번째 번호를 읽는다** — config에 박지 않는다
(운영자 소유 식별자이고, 회원권이 바뀌면 config가 조용히 틀린다). 디버그 출력은 번호를 마스킹한다.

## 지점 (10곳)

`membno_select`가 `resortDiv=0`으로 주는 켄싱턴 리조트 중 페이지가 걸러내는 `RKT09`·`RKT10`을 뺀 것.
`resortDiv=1`은 `연계_*`(금호·웰리힐리·베어스타운·용평) — 다른 회사 시설이라 대상 아님.

| branCd | 지점 | 지역 |
| --- | --- | --- |
| RKT01 | 설악비치 | 강원 |
| RKT05 | 설악밸리 | 강원 |
| RKT02 | 경주 | 경북 |
| RHK12 | 지리산남원 | 전북 |
| RJR01 | 지리산하동 | 경남 |
| RKT08 | 가평 | 경기 |
| RKT03 | 충주 | 충북 |
| RKT04 | 제주한림 | 제주 |
| RKT07 | 서귀포 | 제주 |
| RHK01 | 제주중문 | 제주 |

**뺀 것(운영자 결정 2026-10-18)**: 글로리콘도 해운대(RKT09)·도고(RKT10), 그랜드 켄싱턴 설악비치(GKT01) —
회원 경로·일반 경로 모두 10/28·11/1·11/11·11/25에 **0개 유형**. 넣어도 늘 비어 있는 필터 칩만 생긴다.
호텔 6곳·사이판 3곳은 처음부터 범위 밖.

## 응답과 가용성

`quick_roomdata_member` 조각에서 객실마다 `a.btn_roomsel[data-room-type-cd]`, `.title span`(객실명),
`[data-kfx-price]`("~" 최저가). **매진된 객실은 목록에서 빠진다** — 마감 표기 클래스가 없다
(설악비치 11/1: 1박 9개 → 2박 8개, `16OV`가 사라짐). 그래서:

- 목록에 있는 행 = `available: true`. `closingSoon`은 판정 근거가 없어 `false`.
- 빠진 객실은 `removeVanishedRows`가 지운다(그 지점·날짜에 1행 이상 받았을 때만). 0개 유형 응답
  ("예약 가능한 객실 및 상품 조회 결과가 없습니다.")은 0행이므로 **기존 행을 건드리지 않는다** —
  전 객실 매진과 조회 실패가 이 응답에서는 구별되지 않고, 그 경우 화면의 신선도 강등이 처리한다.
- `roomType` = 객실명(`.title span` 텍스트, 예: "스튜디오 오션뷰 (비리뉴얼/취사)"). 코드(`16OV`)가 아니다 —
  화면에 그대로 나오고 수동 요금 조인 키가 된다.

## 세션

- 세션 없이 `quick_roomdata_member` → **307 → `/reservation/search`**, `quick_member` → **302 → `/`**.
  크롤러는 리다이렉트를 따르지 않고(`maxRedirects: 0`) 3xx를 `SessionLostError`로 읽는다.
- `validateSession` = `quick_member`가 200이고 `membno_select(` 를 담고 있는가.

## 요금 — 예약 요약의 숙박 총액 (2026-10-18 정정)

처음 판단은 "붙이지 않는다"였다. 목록의 `data-kfx-price`는 **1박 최저가("~")**이고(같은 방이 1박·2박에서
같은 값), 요금 플랜(`quick_roomdata_subpack_member`)도 플랜별 "~"가뿐이라 총액이 없다고 봤다.
**총액은 그 다음 단계에 있었다** — 객실을 고르면 사이트가 부르는 `GET /reservation/quick_set_summary/`
(목록과 같은 `#fm_search` 파라미터 + `room_type_cd`, `pack_cd=""`)가 예약 요약을 준다:

```
객실1 ￦348,000  ·  2026. 11. 13(금) ￦169,000  ·  2026. 11. 14(토) ￦179,000
객실요금 합계 ￦348,000(#total_amt)  ·  할인액 ￦0(#total_sale_amt)
```

- `pack_cd=""` = 패키지 없는 기본 분양회원 요금. 요금 플랜 콜을 먼저 부르지 않아도 답한다(경주 10실 실측 —
  서버 상태 없음). 사이트가 그 방·그 숙박에 견적한 값이라 종류는 **`member`**.
- `parse.ts`의 `parseSummaryTotal`은 숫자 하나를 믿지 않는다: 날짜별 줄이 요청한 밤과 같은 날짜들이고,
  그 합이 합계와 같고, 할인액이 0일 때만 값이다(할인이 있으면 합계가 할인 전/후인지 이 화면만으로 모른다).
- **최신화 전용**(`withPrices && branches.length === 1`, 리솜·소노와 같은 게이트). 방마다 1콜 ~0.75초이고 회원
  세션이라 순차만 된다 — 지점 하나 ~10실은 ~11초(경주 12실 11.3초)지만 정기 수집의 한 윈도우(~83실)는 ~60초다.
  그래서 요금은 최신화를 누른 지점에만 붙고 다음 정기 수집이 지운다(`price` COALESCE 금지 규약).
- 요금 실패는 그 행의 빈칸이다. 3xx(세션 상실)도 `price.ts`는 던지지 않고 멈춘다 — 재고는 이미 받았다.

## 인원 — 객실 정보 팝업 (2026-10-18)

`POST /reservation/popup_room_info {bran_cd, room_type_cd}` — 사이트의 "객실 정보" 팝업. **무인증**이다.
`<span class="desc_title">인원</span><span>기준 4명 (최대 성인6/어린이0)</span>`.

- 10지점 83유형 census에서 **전부** 파싱됐다. 모르는 코드에는 빈 틀(`기준 명 (최대 성인)`)이 온다 → null.
- **최대 = 성인 최대 + 어린이 최대.** 설악비치에 `기준 3명 (최대 성인2/어린이3)`이 있어 성인만 쓰면 최대 < 기준이다.
- **쿠키 없는 `fetch`로 보낸다**(`occupancy.ts`). `page.request`로 보내면 회원 세션 잠금에 줄을 선다. 쿠키 없는
  콜은 병렬이 실제로 빨라지고(10개 0.9초), 지점 루프는 기다리지 않고 다음 지점으로 넘어간 뒤 윈도우 끝에서 모아 기다린다 —
  지점마다 기다리게 했더니 캐시가 빈 첫 윈도우가 느려져 패스당 윈도우가 6 → 3이 됐다(겹친 뒤 5).
- 캐시는 모듈 수준 + 6시간 TTL(값이 브라우저와 무관해 페이지에 묶을 이유가 없다). 네트워크 실패는 캐시하지 않는다.
- 정원이라 게이트 없음 — 정기 수집·최신화 모두에서 붙는다. 참고로 요금 플랜의 `data-room-adult-cnt`는 성인 최대와 같다.

## 월 마감일

`POST /reservation/quick_all_room_stock_member {branCd, membNo, yearMonth}` → 전 객실 매진 날짜 배열.
회원번호 없이 부르면 그 달 전체가 "매진"으로 온다(의미 없음). 11~12월 정상 응답 확인 — 회원 예약은
최소 1월까지 열려 있어 핫 윈도우(30일)를 덮는다. 크롤러는 쓰지 않는다(지점별 목록이 같은 답을 준다).

## 디버그 스텝

```bash
npx tsx scripts/debug-kensington.ts branches           # 공개 지점 목록(22곳)
npx tsx scripts/debug-kensington.ts doLogin            # 실로그인 1회 → /tmp/kensington-debug-state.json
npx tsx scripts/debug-kensington.ts membno             # 회원권별 예약 가능 지점
npx tsx scripts/debug-kensington.ts mrooms 1 RKT01 2026-11-11 2      # 회원 객실 목록(회원권 #1)
ROOM=21OV npx tsx scripts/debug-kensington.ts mrooms 1 RKT01 2026-11-11 2   # 그 방의 요금 플랜
npx tsx scripts/debug-kensington.ts member RKT01 2026-11-11 1        # 일반 경로 익명↔세션 대조
npx tsx scripts/debug-kensington.ts mstock 1 RKT01 202611            # 회원 월 마감일
npx tsx scripts/debug-kensington.ts occ RKT02 2026-11-20             # 방마다 인원(크롤러 파서)
npx tsx scripts/debug-kensington.ts price 1 RKT01 2026-11-13 2       # 방마다 요약 총액 + 날짜별
```
