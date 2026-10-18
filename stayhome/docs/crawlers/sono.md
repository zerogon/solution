> `AGENTS.md`에서 옮긴 문서다(2026-10-01, 지침 파일 150k자 한도). 내용은 그대로이고,
> `CLAUDE.md`·코드 주석이 "`AGENTS.md`의 SONO 크롤러 절"이라 부르는 곳이 여기다.
> 자동 로드되지 않으므로 이 크롤러를 만질 때 직접 읽을 것.

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

⚠️ **이 절의 결론은 2026-09-21에 뒤집혔다.** 여기 적힌 관측은 전부 그대로 참이지만
(재고 응답 15키에도 `room/detail` 34키에도 돈이 없다), **소노에는 요금이 있다** —
객실 선택보다 한 홉 더 뒤의 `room/detail/price`가 답한다. 아래 "### 요금은 있었다"를
먼저 볼 것. 이 절을 지우지 않는 이유는 그 조사가 어디까지 물었고 어디서 멈췄는지가
다음 조사의 출발점이기 때문이다 — 실제로 그 경계(📌 "이 조사는 객실 선택까지다")가
09-21 조사가 시작된 자리다.

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
(2026-09-11: 이 문장은 **요금**에 대해 그대로 참이다. 변형별 잔여 수는 이제 행의 `variants`에
남으므로 "접혀서 버려진다"는 부분만 옛말이 됐다 — 아래 "### 변형은 뷰 축이고 이름은 응답에 없다".)

### 인원도 없다 — 그리고 막는 것은 접기가 아니었다 (2026-08-31)

`rmTypeList` 15키에 정원이 없다는 것은 이미 적혀 있었고, 이번에 **그 너머**까지 물었다.

- **공개 객실 소개 페이지**(`/complex_vp/roomsviewall` 등)의 SSR 페이로드에
  `personCnt`와 `peopleCntText`가 **있다.** 그리고 **61개 객실 전부 `null`이다.**
  리솜 `rmAmt`(506엔트리 전부 `"0"`)와 같은 함정이고, 이름만 보고 배선했다면 전 객실이
  0명으로 나갔을 것이다.
- **`room/detail`은 닿지 못했다.** `flow`의 자동 클릭이 hop 2에서 멈췄고
  (`누를 것이 없습니다`), 직접 POST로 부르면 `"이용회원번호는 필수입니다"`(`W22M3S4`)에
  걸린다 — `memNo`·`userIndCd`·`rsvIndCd`·`echPyeongMemNo`·`outsMemNo` 어느 조합으로도
  안 열렸다. 번들의 조립부(`ce.reserve.rsv.room.detail`)는 `listPc`와 **같은 본문
  빌더**를 쓰는데도 그렇다. ⚠️ **이것은 "정원이 없다"의 증거가 아니다** —
  셀렉터/필드를 못 찾은 것과 구별되지 않는다(이 파일이 `flow` 절에 적어둔 그 경고).
  다시 볼 때는 `SONO_FLOW_MANUAL=1`로 손으로 몰 것.
- 📌 **부수 소득 — 요금 조사의 결론을 다시 봐야 할 자리가 나왔다.** 번들에
  `${Pt}/detail/price` · `/detail/price-detail` · `/detail/coin-price`가 **셋이나**
  선언돼 있다(`Pt = "/memberReservation/room"`). 08-25의 `flow`는 `room/detail`까지만
  걸었고 이 셋은 부른 적이 없다. "소노에 요금이 없다"는 그 조사의 경계 안에서만 참이다.

**접기는 범인이 아니다** — 이 문서와 `CLAUDE.md`가 오래 그렇게 적고 있었다.
실측(2026-08-31, 4지점 1,080엔트리): 570그룹 중 **2개 이상으로 접힌 그룹이 300개(52%)**인데
**평형(`pyeongCd`)이 섞인 그룹은 0개**다. 접힘은 전부 뷰(`viewCd`) 축이라 같은 평형이고,
따라서 그 그룹에 단일 정원이 없을 이유가 없다. 요금이 막혔던 이유(`rsvRmCnt`가 변형마다
다르다)를 정원에 그대로 옮겨 적은 것이 틀렸다. **소노가 빈 것은 값이 없어서다.**

### 변형과 그 이름 — `room/detail`은 `actualMemNo` 하나로 열린다 (2026-09-11 배선 · 09-13 이름·실측)

**2026-09-13 요약**: 변형(`rmTypeCd`)은 뷰 축만이 아니라 **뷰 × 취사 × 침대**이고(한 뷰 안에
`rmTypeCd`가 최대 4개 — 역방향 1:1 위반 11/36), 그 이름은 `room/list/pc`에 없고
`POST memberReservation/room/detail`에 있다. 그 콜은 **본문에 `actualMemNo`(= `memNo`)를 실으면
저장된 쿠키만으로 열린다.** 크롤러는 `sono/names.ts`로 배치마다 한 번 묻는다. 아래 원래 절(09-11)의
"이름은 `SONO.viewNames`에서만 온다"는 **폐기됐다** — 그 표는 삭제했다.

| 본문 | 결과 |
| --- | --- |
| SPA가 보낸 그대로(`memNo`·`actualMemNo`·`rsvBlckCd:"000"` …) | 200 · 16말단 |
| `actualMemNo` 뺌 | **400 `W22M3S4` 이용회원번호는 필수입니다** |
| `rsvBlckCd` 뺌 | 200 · 같은 답 |
| 새 컨텍스트(저장된 storageState만, 네비게이션 0) | 200 · 같은 바이트 |

- **응답 모양**: `body[]`(객실유형) `> viewList[]`(`viewCd`·`viewNm`) `> rmTypeList[]`(34키 —
  `rmTypeCd`·`viewNm`·`cookNm`·`bedNm`·`rmTypeNm`·`rsvStatusCd`·`rsvRmCnt` …). **어느 층에도
  `storeCd`가 없다** — 8지점 배치의 답은 `rmTypeCd`로만 키잉된다.
- ⚠️ **`variants` 스텝의 첫 실행은 이 콜을 "안 열림"으로 판정했다.** 열린 응답(10KB, 200,
  `success:true`)을 `list/pc` 모양(`body[].rmTypeList`)으로 세어 0이 나왔기 때문이다.
  `detailLeavesOf`로 고쳤다. 09-07 `subtypes` 조사의 "known-good 본문으로도 거절"도 같은 자리의
  다른 실수다 — `list/pc`의 본문에는 애초에 `actualMemNo`가 없다.
- **그래도 지점 없이 키잉해도 되는 근거**(32지점 × 2날짜 × 지점별 호출 64회): 288코드 중 같은
  코드에 **비어 있지 않은** 뷰·취사·침대 이름이 둘 이상인 경우 0. 어긋난 7코드는 전부
  `rmTypeNm`의 띄어쓰기(`"골드"`/`"골 드"`)나 `groupRoomNameNm`, 또는 한쪽이 공백 자리표시자
  `" "`인 경우였다. 그래서 병합은 **칸 단위로 공백은 정보가 아니고, 비어 있지 않은 두 값이 다르면
  그 코드는 이름을 포기**한다(오크밸리 `occupancy.ts`의 `record`와 같은 규칙).
- **커버리지**: 한 날짜의 detail이 전 지점 `list/pc` 코드 **382/382**를 명명했고, 8지점 배치가 지점별
  호출의 합집합과 같은 코드를 답했다(62/62). `list/pc`의 변형 집합은 날짜·달 사이에 변하지 않았다(0/30).
- **비용**: 1지점 0.7초 · 4지점 0.8초 · 8지점 1.0초. 배치당 1콜 × 4배치, `ctx.page` WeakMap으로
  **패스당 한 번**(2박 패스는 0콜). 타임아웃은 `ctx.deadlineAt`에서 유도하고 8초 미만 남으면 묻지
  않는다. **절대 던지지 않는다** — 실패 방향은 코드 라벨 + `[sono] unnamed rmTypeCd` 로그다.
- **라벨** = `${viewNm} ${cookNm}/${bedNm}`. 사이트 자신의 조립 규칙(`entry.*.js`의
  `${groupRoomNameNm viewNm cookNm}/${bedNm}`)에서 객실유형만 뺐다 — 행이 이미 객실유형을 말한다.
  취사 칸이 공백인 호텔은 `스탠다드/더블`이 된다. 관측 어휘: 뷰 `스탠다드 파크뷰 오션뷰 파셜오션뷰
  레이크뷰 파노라마 설악마운틴 가든뷰 …`, 침대 `침대 더블 트윈 온돌 패밀리 트윈 킹 트윈 트리플
  2더블,1싱글 …`.
- 공개 객실 카탈로그(`facilityNm` "스위트 파크뷰" 등)는 09-07에 확인한 대로 **조인 키가 전부 null**이라
  쓰지 않는다. 이제 쓸 이유도 없다.

실측(2026-09-13): `run-crawl SONO "소노벨 청송"` 콜드 로그인 포함 108행 15.1초, 16/16 명명 —
`리조트 스위트` 1박이 `스탠다드 취사/더블 65실 · 스탠다드 클린/더블 30 · 파크뷰 취사/더블 22 ·
파크뷰 클린/더블 30 · 스탠다드 취사/온돌 13`. `CRAWL_BUDGET_MS=50000 run-crawl SONO hot` →
**60/60 · 56스킵 · 20,384행 · 49.8초 1패스**(프로덕션 크론은 09-12에 같은 스윕을 46.6초+21.4초
2패스로 돌았다 — 예산 게이트가 나누는 구조는 그대로이고 이름 콜은 첫 윈도우에만 ~4초 붙는다).
DB: 변형 37,436개 중 **코드 라벨 0**, 행↔변형 불변식(아래 SQL) 위반 0, 펼칠 수 있는 행 7,546,
비소노 `variants` 0. 2박 접기 오판은 540행 중 2(청송·제주 리조트 패밀리 9/17).

#### 원래 절 (2026-09-11) — 판정·그릇은 그대로, 이름 출처만 위 절로 바뀌었다

운영자가 보고 싶은 세부 타입(스탠다드/파크뷰 → 더블취사/트윈취사 …)은 이 크롤러가 **접어서
버리고 있던 것**이다. `rmTypeList` 15키 중 `rmTypeCd`(변형 = 사이트의 예약 단위) · `viewCd` ·
`pyeongCd` · `roomTypeCd`는 `RoomListPayload`에 선언되지 않아 타입 경계에서 사라졌고,
`parse.ts`는 `resortTypeNm + roomTypeNm`으로 접으면서 `rsvRmCnt`를 버렸다.

**이제 접힌 행이 자기 변형을 `variants`로 들고 간다**(`src/lib/variants.ts`,
`ResortInventory.variants` jsonb). 행은 그대로다 — 행 수·유니크 키·`removeVanishedRows`
그룹 키·수동 요금 조인 무변경. 설계 근거는 `CLAUDE.md`의 "소노 변형" 절.

- **판정이 변형 단위로 내려갔고, 행은 거기서 유도된다.** 변형마다 숙박 전 밤을 AND(밤이 하나라도
  없으면 그 변형은 목록에서 빠진다), 행은 `available = some(variant.available)`,
  `closingSoon = available && every(bookable.closingSoon)`. **1박은 옛 접기와 동치**다.
  2박부터는 옛 접기가 틀렸다 — 밤마다 아무 변형이나 OR하고 밤을 AND하면 1박째 스탠다드만,
  2박째 파크뷰만 가능한 행이 초록이 된다. 사이트는 `rmTypeCd` 하나로 전 숙박을 예약한다.
  행의 **존재** 조건("모든 밤에 엔트리")은 그대로라 행 수는 변하지 않는다.
- **`remaining` = `available`일 때 전 밤 중 최소, 아니면 null.** `W`의 음수는 수가 아니다.
- **이름은 `SONO.viewNames`에서만 온다.** 응답에 `viewNm`이 없다. 표에 없는 코드는 코드가
  라벨이고 `search.ts`가 `[sono] unnamed viewCd {codes}`를 배치당 한 번 남긴다. 키는
  `"66:01"`(지점 한정) → `"01"`(전역) 순으로 본다 — 어느 모양이 맞는지는 `variants` 스텝
  Part 1이 답하고, **지금 표는 비어 있다.** 즉 조사 전에 배포되면 화면에는 코드가 보인다
  (의도된 강등, 지어낸 이름보다 낫다).
- **같은 라벨이 한 행에 둘이면 `라벨 (rmTypeCd)`**로 구별한다. 한 `viewCd` 안에 `rmTypeCd`가
  여럿이면 세부 축이 이미 `list/pc`에 갈라져 있다는 뜻이고, 그 둘을 합치면 "44실"의 거짓이 돌아온다.
- `rmTypeCd`가 비면 `viewCd/pyeongCd/roomTypeCd` 합성 키, 그것도 비면 단일 트랙 = 옛 접기.
  강등 방향이 "어제의 동작"이지 쓰레기가 아니다.

**`variants` 스텝이 묻는 것**(다섯 파트, 각자 try/catch): ① (지점, 객실유형)별 코드 census와
`viewCd`의 전역/지점별 판정, `pyeongCd` 혼합 재확인 ② `rmTypeCd` → (roomTypeCd, viewCd, pyeongCd)
함수성·역방향 1:1·날짜/월 안정성, 요청 `rmTypeCode`의 뜻(항상 `""`였고 아무도 안 물어봤다),
**2박 접기 오판 행 수** ③ `viewCd` 이름 출처 — `userinfo` 전 필드(화이트리스트 마스킹 — 회원사·
담당자·연락처가 평문이다), SPA 번들의 코드표 엔드포인트·`room/detail` 본문 빌더, 그리고
`room/detail` 재현(SPA로 200을 잡은 뒤 선행 콜 `room/filter`→`reserve/pre`→`session/check`
순서 재생 ①, 단독+본문 보강 ②, 새 컨텍스트 ③ — H1 서버 세션 상태 / H2 빠진 필드 / H3 헤더)
④ 열렸다면 34키·`viewList` 키(`viewNm`?)·`bedNm`/`cookNm` 어휘·null 비율·`rmTypeCd` 조인율
⑤ `storeCdList` 1/4/8 비용과 응답 폭. **세부 축 GO 조건 넷**: DOM 없이 열림(선행 ≤3콜) ·
8지점/콜 또는 월 단위 · 조인 ≥99% · 이름 non-null ≥95%.

2026-09-11에는 `.env`가 없어 돌리지 못했고 **2026-09-13에 돌렸다**(결과는 위 절). `recordFlow`는
이 스텝을 위해 요청 헤더 **이름**(값 아님)을 함께 기록한다(`Capture.reqHeaders`) — 09-13에 H3(헤더)는
불필요로 판명됐다(새 컨텍스트의 `page.request`로 열린다).

검증 SQL(조사·`db:push` 뒤):

```sql
select resort_name, count(*) total, count(variants) with_variants from resort_inventory group by 1;  -- SONO만 total=with_variants
select jsonb_typeof(variants), count(*) from resort_inventory where variants is not null group by 1; -- 'array'만
select count(*) from resort_inventory r, jsonb_array_elements(r.variants) v
 where not (v ? 'label' and v ? 'code' and v ? 'available' and v ? 'closingSoon' and v ? 'remaining'); -- 0
select count(*) from resort_inventory r, jsonb_array_elements(r.variants) v where (v->>'remaining')::int < 0; -- 0
select count(*) from resort_inventory r, jsonb_array_elements(r.variants) v where v->>'label' = v->>'code'; -- 이름 못 받은 변형 (09-13 실측 0/37,436)
select count(*) from resort_inventory where resort_name like '소노%' and available
   and not exists (select 1 from jsonb_array_elements(variants) v where (v->>'available')::bool); -- 0 (행≠변형 모순)
```

### 요금은 있었다 — `detail/price`는 `rmTypeCd` 하나로 열린다 (`prices` 스텝, 2026-09-21)

08-25 `flow`는 객실 선택(`room/detail`)까지 걸었고 거기 요금이 없어 "소노는 금액을 주지
않는다"로 닫혔다. 그 결론은 **그 조사의 경계 안에서만** 참이었다. 번들은 그 뒤로 셋을
선언하고 있었고(`Pt = "/memberReservation/room"`), 이 저장소는 셋 중 어느 것도 한 번도
부른 적이 없다:

```
POST {apiBase}/memberReservation/room/detail/price          ← 열린다. 총액·밤별·시즌
POST {apiBase}/memberReservation/room/detail/price-detail   ← 열린다. 밤마다 9개 금액 칸
POST {apiBase}/memberReservation/room/detail/coin-price     ← 400 W76M2S1 "AIRCOIN 정보가 존재하지 않습니다"
```

**문을 연 것은 `rmTypeCd` 하나다.** 그리고 이번에는 사이트가 **빠진 칸의 이름을 직접
댔다** — `storeCd 는 필수값입니다` → (채우면) `rmTypeCd 는 필수값입니다` → (채우면) 200.
`room/detail`의 `W22M3S4`처럼 "무엇이 빠졌는지 말하지 않는" 거절이 아니었으므로, `prices`
스텝의 사다리(Part 1b)는 **이름을 서버에서, 값을 `list/pc` 표본에서만** 가져온다. 지어낸
값은 한 칸도 없고, 관측에 없는 이름을 요구하면 그 자리에서 멈춘다.

- **`room/detail`과 다른 계열이다.** 이쪽은 `storeCd`·`rmTypeCd`를 **단수 문자열**로
  받는다. 배열을 주면 500 `Cannot deserialize value of type java.lang.String from Array`,
  `storeCdList`는 실어도 무시된다. 즉 **배치가 구조적으로 불가능하다.**
- 나머지 본문은 `names.ts`가 쓰는 것과 같다(`memNo` + **`actualMemNo`** + `userIndCd`
  `rsvIndCd` `ciYmd` `coYmd` `nights` `rmCnt` `adultCnt` `childCnt`).

**응답** (`detail/price`, 소노벨 청송 `00I00212` 2026-10-05 1박):

```json
{"dcAmt":0,"levelAmt":25000,"totAmt":146000,"originAmt":171000,
 "preAftPayAmt":146000,"longSbscrbAmt":null,"speclBnftAmt":null,
 "benefitDiscountList":[],"dailyPreAftPayList":[],
 "daysAmtInfoList":[{"stndYmd":"20261005","totAmt":171000,"levelAmt":25000,"dcAmt":null,"seasonCd":"41"}]}
```

읽을 때 반드시 지킬 것 넷 — 전부 실측이다:

1. **쓸 값은 `body.totAmt`다.** `originAmt − levelAmt = totAmt`(171,000 − 25,000 = 146,000)이고
   `levelAmt`가 회원 등급 할인이다. ⚠️ **`daysAmtInfoList[].totAmt`의 합은 총액이 아니다** —
   그 배열은 밤마다 **할인 전** 금액을 싣는다(1박 밤합 171,000 vs 총액 146,000). 밤별 합을
   총액으로 쓰면 할인이 통째로 사라진다.
2. **곱하지 않는다.** 응답이 숙박 **전체**의 총액을 준다 — 1·2·3박이 146,000 → 292,000 →
   438,000이고 밤 배열도 1·2·3개로 늘었다. 롯데 `roomAvgAmt`(1박 평균 × 박수)와 반대이고
   리솜 `totalRmAmt`와 같다.
3. **예약할 수 없는 변형에도 값이 온다.** 마감임박(`E`) 146,000, **예약대기(`W`) 392,000**.
   응답에 리솜 `isPossible` 같은 자기 부인 칸이 없으므로 가용성 게이트는 **우리 쪽**에
   있어야 한다(롯데 `parse.ts`가 `available ? priceOf(...) : null`을 하는 그 자리).
4. **날짜를 지킨다**(오크밸리 `probe` 교훈 통과). ci+0 146,000/시즌 41, ci+30 171,000/시즌 41
   (그날은 `levelAmt` 0), ci+60 170,000/**시즌 43**. 파라미터를 무시하는 응답이 아니다.

**조인 단위는 `rmTypeCd` — 즉 변형이다.** 이 크롤러의 행은 변형을 접은 행이고(570그룹 중
300개), 그래서 "그 방의 값"이 하나가 아니다. 08-24에 이 파일이 "요금이 나왔더라도 행에
붙일 수 없었다"고 적어둔 그 문제가 그대로 살아 있다. 다만 **09-11에 `variants` 컬럼이
생겨 선택지가 하나 늘었다** — 변형마다 요금을 싣고 행에는 최저가 + "부터".

**비용이 배선 형태를 정한다.** 콜당 **166ms**(16콜 2.65초, 한 지점 하루 전 변형).
리솜(0.2~1.8초)보다 빠르지만 구조는 같다 — **(변형 × 날짜 × 박수)마다 1콜**이다.
핫 윈도우 전체는 32지점 × 60윈도우 × ~16변형 ≈ **30,000콜 ≈ 80분**으로 패스 예산(30초)
밖이다. 반대로 "최신화"가 지목하는 **지점 1곳 · 윈도우 1개는 2.6초**라 50초 예산 안에
여유가 크다. ⇒ 가능한 형태는 리솜과 같은 **`withPrices` 게이트 아래 최신화 전용**이다.

**GO 조건 4개 중 3개 충족** — 열린다 · 값이 있다 · 조인된다(변형 단위) · **배치는 불가능**.
`price-detail`은 밤마다 `{originAmt, dcAmt, levelAmt, billingAmt, companyAmt, preAftPayAmt,
totAmt, speclBnftAmt, longSbscrbAmt}` 9칸을 주고 **`companyAmt`가 리솜 `totalCmpnyRmAmt`와
같은 자리**다(관측 0). 0이 아닌 계정에서는 `totAmt`가 직원 실부담액이 아니므로, 리솜
`price.ts`가 그때 요금을 붙이지 않는 것과 같은 판단이 필요해진다 — 고칠 자리는
`prices.ts`의 `readAmount`이고 읽을 곳은 `price-detail`이다.

### 요금 수집 — 변형마다 붙는다, 최신화 경로에서만 (`prices.ts`, 2026-09-21 배선)

수집기는 `src/crawlers/sono/prices.ts`이고 `names.ts`와 같은 모양이다(패스 안에서 한 번,
`ctx.deadlineAt`에서 유도, **절대 던지지 않음**). 다른 넷과 갈리는 점은 하나 — **요금이
행이 아니라 `variants[]`에 붙는다.**

- **왜 변형인가**: 사이트가 `rmTypeCd`(변형) 하나를 묻는 콜로 답하고, 이 크롤러의 행은
  변형을 여럿 접은 것이다. 같은 행의 변형끼리 요금이 다르다 — 실측 `리조트 패밀리`
  한 행에서 `스탠다드 취사/더블` 97,000원과 `파크뷰 클린/트윈` 137,000원. 행에 하나를
  고르면 나머지는 틀린 값이고, 최저가로 접으면 행이 "부터"라고 말해야 하는데 그 말은
  행이 하는 다른 모든 말(잔여·상태)과 단위가 어긋난다.
- **게이트는 리솜과 같다** — 라우트가 `branch` 유무로 `withPrices`를 세우고(`refresh/route.ts`),
  `search.ts`가 `withPrices && branches.length === 1`을 다시 본다. 어긋났을 때의 증상이
  항상 "요금이 안 나옴"(안전)이지 "예산 초과"(위험)가 아니다.
- **예약 가능한 변형에만.** 사이트는 마감임박·예약대기 변형에도 금액을 답하고 응답에
  리솜 `isPossible` 같은 자기 부인 칸이 없어서, 가용성 게이트가 우리 쪽에 있어야 한다.
- **응답 하나에서 총액만 읽는다.** `body.totAmt`이고, 밤 배열은 **할인 전** 값이라 금액의
  출처가 아니라 *우리가 물은 숙박이 맞는지* 확인하는 자료다(`readAmount`가 밤 수 ·
  첫 날짜 · `밤합 === originAmt` · `originAmt − levelAmt === totAmt` 넷을 본다).
  `dcAmt`는 관측 전부 0이라 이 산술에 없고, 0이 아닌 날이 오면 등식이 깨져 **요금을
  만들지 않는다** — 모르는 할인을 우리가 해석하는 것보다 빈칸이 낫다.
- **`pricedRows`가 변형 요금도 센다**(`run.ts`의 `hasPrice`). 행만 세면 이 리조트에서
  그 숫자가 영원히 0이라, 예산에 걸려 일부만 붙은 절단이 보이지 않는다. Hobby는 런타임
  로그를 보관하지 않으므로 `crawl_logs`의 그 칸이 유일한 지속 증거다.
- `/api/inventory`·스키마·`run.ts`의 upsert는 **무변경**이다 — 요금이 이미 있던
  `variants` jsonb 안에 들어간다. 다만 변형 객체의 모양이 바뀌었으므로 `sw.js`의
  `CACHE_VERSION`이 v5 → **v6**이고, `isVariantList`가 `price`를 검사한다(없으면 통과 —
  09-21 이전에 쓰인 행이 세부 목록을 통째로 잃으면 안 된다).

실사이트 검증(2026-09-21):

```
run-crawl SONO "소노벨 청송"   콜드 로그인 포함 60행 16.8초 · 변형 이름 16/16
                               [sono] variant prices attached
                                 priced 13 / candidates 13 / calls 13 / 2.37초 / 최장 253ms
run-crawl SONO (전 지점)       2,080행 14.0초 · pricedRows 0 · 앞의 요금 13건이 null로 덮임
```

DB 불변식 위반 0건 — 예약 불가 변형에 요금 0 · 금액 ≤ 0 0 · `kind`가 `member` 아닌 것 0 ·
**소노 행의 `price_kind` 0**(요금은 행이 아니라 변형에 있다) · 비소노 행에 `variants` 0 ·
행↔변형 모순 0 · 이름 못 받은 변형 0(변형 31,324개). `tsc`·`eslint`·`next build` 통과,
번들 유출 0건(`storeCd|rmTypeCd|actualMemNo|memberReservation|detail/price`).

⚠️ **전 지점 크롤이 요금을 지우는 것은 버그가 아니라 정의다.** upsert가 한 행을 한 문장으로
쓰므로 **요금의 나이 = `synced_at`**이고, 이 등식은 변형 안의 요금에도 그대로 적용된다
(`run.ts`의 COALESCE 금지 주석). 요금은 최신화의 산물이지 재고의 속성이 아니다.

**행 줄의 요금은 화면이 유도한다**(2026-09-27). 변형 요금만 있으면 세부 목록을 펼쳐야 보이는데,
펼침은 변형 ≥2일 때만이라 변형 1개인 행(실측 16행 중 13행)에서는 요금이 아예 안 보였다.
`BranchResultSection`이 `variantPriceSummary`로 값 하나면 그 값, 갈리면 최저가 `~`를 그린다 —
저장하지 않으므로 DB 불변식("소노 행의 `price_kind` 0")은 그대로다.

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
npx tsx scripts/debug-sono.ts variants ["지점,지점"]   # 변형 조사 — viewCd 어휘 · 2박 오판 수 · room/detail 재현
SONO_FLOW_MANUAL=1 CRAWLER_HEADLESS=false npx tsx scripts/debug-sono.ts variants   # Part 3c를 손으로
npx tsx scripts/debug-sono.ts prices ["지점,지점"]     # 금액 조사 Q4 — detail/price 사다리 · 비용 · 조인 단위
SONO_FLOW_MANUAL=1 NET_WAIT_MS=240000 CRAWLER_HEADLESS=false npx tsx scripts/debug-sono.ts prices   # Part 3을 손으로
npx tsx scripts/run-crawl.ts SONO                      # 전 지점 → 요금 없음(정기 수집과 같은 경로)
npx tsx scripts/run-crawl.ts SONO "소노벨 청송"          # 지점 하나 → 변형별 요금까지 (최신화 버튼과 같은 경로)
```

**`prices` 스텝이 존재하는 이유**: `flow`는 *그 화면이 부르는 콜*을 물었고 객실 선택에서
멈췄다. 이건 **"그 화면이 부르는 콜이 우리가 걸어본 홉의 전부는 아니다"**를 묻는다 —
계보의 네 번째 질문이다(`probe` → `keys` → `flow` → `prices`). Part 1b의 사다리가 이
스텝의 핵심이고, 규칙은 하나다: **이름은 서버가 대고 값은 관측에서만 온다.** 관측에 없는
이름을 요구하면 멈춘다 — 거기서부터는 조사가 아니라 추측이다.
⚠️ Part 3의 자동 클릭은 달력 셀과 "확인" 모달까지만 누른다. 결제·확정 라벨은 후보에서
빼 두었고(`FORBID`), 그래도 **법인 실계정이므로** 손으로 몰 때는 결제 단계로 넘어가지 말 것.

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
