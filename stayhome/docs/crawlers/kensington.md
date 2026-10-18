# 켄싱턴 크롤러 (2026-10-18)

`www.kensington.co.kr` 한 호스트. 이랜드파크 운영. 조사 도구는 `scripts/debug-kensington.ts`.

| 항목 | 값 |
| --- | --- |
| 로그인 | **무기명(법인) 회원** `/member/login_corp/` — 일반 회원 로그인이 아니다 |
| 예약 경로 | **분양회원 빠른예약** `/reservation/quick_member` (로그인 시에만 메뉴가 생긴다) |
| 재고 콜 | `GET /reservation/quick_roomdata_member/?…&pay_type=D&memb_no=<분양회원번호>` → HTML 조각 |
| 지점 | 10곳(아래 표). 지점마다 1콜 — 롯데형 |
| 요금 | **이번에는 붙이지 않는다**(아래 "요금") |
| 인원 | 미부착(목록에 없다) |
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

## 요금 — 이번에는 붙이지 않는다

목록의 `data-kfx-price`는 **1박 최저가("~")**다: 같은 방이 1박·2박에서 같은 값(109,000). 요금 플랜
(`quick_roomdata_subpack_member`, 방마다 1콜)도 1·2·3박에서 플랜별 "~"가를 그대로 보여준다 —
총액은 그 뒤 단계(`quick_set_summary`)에나 있다. `InventoryRow.price`는 **숙박 총액**이 계약이고
"~최저가 × 박수"는 주말이 섞이면 틀린 총액을 낸다. 틀린 요금은 담당자가 직원에게 전달하므로
붙이지 않는다. 필요하면 화면의 수동 요금(1박 단가)으로 넣는다.

참고: 요금 플랜 응답에는 `data-room-adult-cnt`(4)·`data-room-child-cnt`(2)가 있다. 기준인원이 아니라
최대 구성으로 보이고 방마다 1콜이라 인원도 붙이지 않는다(`occupancy`는 둘 다이거나 둘 다 아니다).

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
```
