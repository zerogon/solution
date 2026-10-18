> `CLAUDE.md`에서 옮긴 문서다(2026-10-01, 지침 파일 정리). 내용은 그대로이고,
> 다른 문서·코드 주석이 "`CLAUDE.md`의 "조회 필터" 절"이라 부르는 곳이 여기다.
> 자동 로드되지 않는다 — 요약과 색인은 `CLAUDE.md`에 있다.

# 조회 필터 (Phase F 준비)

`src/lib/resort-catalog.ts` + `src/components/search/{place-selection,PlaceFilter,PropertyPicker,FilterChipRow}.tsx`.

- **크롤러 config는 클라이언트 번들에 흘러가면 안 된다.** 예전엔 `BranchTabs`가
  `@/crawlers/lotte/config`를 직접 import해 `bizCd`(예약 API 프로퍼티 코드)가 실제로
  브라우저까지 나갔다. 이제 `resort-catalog.ts`가 `server-only`로 막고 UI에 필요한
  필드만 뽑아 서버 컴포넌트(`app/(app)/page.tsx`)가 props로 내려보낸다.
  회귀 검사: `npm run build && grep -r "bizCd\|roomListApiUrl\|loginPw" .next/static` → 0건.
- **지점 메타는 DB 테이블이 아니라 카탈로그 모듈.** `ResortInventory.branchName`은
  크롤러가 `config.branches[].value`를 그대로 저장한 값이라, 테이블을 만들면 같은
  리스트의 사본이 생긴다. 사본이 어긋나면 증상이 "필터를 눌렀는데 0건"이고 크롤 실패와
  구분되지 않는다. 카탈로그는 UI가 읽는 배열 = 크롤러가 도는 배열이라 그 드리프트가 없다.
  · **DB에 있는 것은 목록이 아니라 목록에서 빼는 규칙이다**(2026-08-29,
    `resort_branch_exclusions`). 아래 "지점 제외" 절 — 그 표는 카탈로그에서 뺄 수만 있고
    더할 수 없어서 위 논증에 걸리지 않는다.
- **축은 점진 노출**(`visibleAxes`). 리조트 축은 리조트 ≥2, 지역 축은 지역 ≥2 **그리고**
  지점 수 > 지역 수일 때만 뜬다. 롯데 단독(지점 4 / 지역 4)일 때는 둘 다 숨겨져 지점 칩 한
  줄만 남았고, 소노가 붙으면서(지점 36 / 지역 10) 두 축이 저절로 나타났다 — 이 분기는
  리조트가 2곳이 된 2026-08-09에야 처음 실행됐다.
  `REGION_ORDER`는 `place-selection.ts`에 있다 — 카탈로그는 server-only라 클라가 못 읽는다.
- **무효 조합은 상태로 존재할 수 없다.** `selectResort/Region/Property` 세 함수가 상위 축
  변경 시 모순되는 하위를 지우고, 지점 선택 시 상위를 그 지점 값으로 채운다.
  `StayRangeCalendar`가 `{from, to: undefined}`를 안 만드는 것과 같은 판단.
- **서버 필터 축은 `resort` 하나뿐.** 지역·지점은 클라이언트 `matchesPlace`가 좁힌다 —
  칩마다 예약 가능 건수 배지가 왕복 없이 나오고, `stale` 흐림이 날짜/리조트 변경에만 걸린다.
  `matchesPlace`는 카탈로그가 아니라 **행 자신의 `region`/`resortSlug`**로 판정한다.
- **최신화는 항상 단일 지점.** 여러 리조트 동시 최신화는 호출 1건 = 브라우저 1세션이라
  불가능하고, `/api/resorts/[slug]/refresh`는 `maxDuration=60`에 `runResortCrawl` 50초
  예산이다. 전 지점 최신화가 그 예산에 들어가는지는 **리조트마다 다르다** — 지점당 1콜인
  롯데(4지점)와 32지점을 4콜로 묶는 소노(로그인 포함 17초)는 둘 다 여유가 있지만,
  지점마다 DOM을 도는 크롤러가 붙으면 `withDeadline`이 터져 **그 윈도우의 부분 수집분까지
  통째로 버려지고 0행 FAILED**가 된다(`run.ts`가 `searchAvailability` 전체를 하나의
  데드라인으로 감싼다). 그런 크롤러는 지점 루프에서 throw가 아니라 break로 부분 반환해야 한다.
- **"예약 가능만 보기"(2026-09-15)는 결과 목록의 표시 필터다** — 서버 축도 쿼리 키도 아니고
  `/api/inventory`·`sw.js`(`CACHE_VERSION`)는 무변경. 판정은 `availability-tone.ts`의 `isBookable`
  (확인된 가용 = `available`·`closingSoon`, **확인 필요는 숨김** — 운영자 결정) 한 곳이고, 요약 스탯·
  칩 건수·지점 헤더도 같은 술어를 쓴다. 그래서 켰을 때 남는 행 수 = 요약의 "예약 가능 N건".
  요약과 지점 헤더는 **필터 전 행**으로 세고 좁히는 것은 목록뿐이다. 단 헤더의 요금 종류 라벨은
  목록(`listed`)에서 구한다(숨긴 매진 행의 수동 요금이 라벨만 남기지 않도록). 상태는 브라우저별
  localStorage(`use-available-only.ts`, 기본 꺼짐).
- 지점 후보가 **16곳**을 넘으면 칩 그리드 대신 검색 가능한 바텀시트(`PropertyPicker`).
  8이던 시절(~2026-09-27) 소노 · 강원(14곳)이 시트 버튼 하나로만 보여 운영자가 지점을 고를 수
  있다는 것을 몰랐고, 그래서 최신화가 꺼져 있었다. 16 = 리조트·지역으로 좁혔을 때의 최대 후보(한화 16).
  칩 그리드 컬럼 수는 **개수 비의존**이어야 한다 — 예전 `sm:grid-cols-5`는 옵션 5개에
  맞춘 값이라 지점 수가 바뀌면 마지막 줄에 조각 칩이 생겼다.

