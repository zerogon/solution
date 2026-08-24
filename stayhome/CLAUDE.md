@AGENTS.md

# Welfare Stay — Agent Notes

## 프로젝트 컨텍스트

사내 복지 담당자 1인용 제휴 리조트 통합 조회 시스템. 대상은 5개 리조트(롯데·리솜·한화·오크밸리·소노)이고
**5곳 전부 운영 중**이다(2026-08-13, 지점 합계 57곳). MVP는 롯데 1개로 시작했고,
나머지는 크롤러 모듈 + 배선 2~3줄로 붙는 구조를 유지한다 — Inngest 함수·조회 UI·`/api/inventory`는
리조트를 네 번 늘리는 동안 한 줄도 바뀌지 않았다. `run.ts`·`types.ts`는 **한화에서 처음
바뀌었는데**, 배선이 아니라 새 능력이 필요해서다(로그인이 세 번째 비밀값을 요구한다 —
아래 "자격증명" 절).
(대명리조트는 소노로 리브랜딩되어 SONO 하나로 통합, 켄싱턴·현대는 대상에서 제외됨.)

전체 설계: `prd.md`.

## 스택 / 핵심 결정

- Next.js 16 + React 19 + Tailwind v4 + shadcn v4 (`base-nova` 스타일, base-ui 기반)
- Prisma 7 + Neon PostgreSQL (`@prisma/adapter-pg`, pooler + direct URL)
- NextAuth v5 **Credentials**(ID/PW · bcrypt, `src/auth.ts`) + JWT 세션.
  `User.loginId`/`User.password`로 인증하며 Google 프로바이더는 쓰지 않는다
  (prd.md의 원안이었으나 사내 Google 계정 전제가 성립하지 않았다).
- Playwright + `@sparticuz/chromium-min` (Vercel Functions 내부 실행)
- Vercel Cron → Inngest fan-out → 리조트별 함수 (Hobby 60초 제약은 Inngest step 분할로 우회)
- 자격증명: AES-256-GCM 암호화 (`src/lib/crypto.ts`), 마스킹 + 감사 로그

## 디자인 시스템

형제 프로젝트 `pianoflow`(같은 저장소의 `pianoflow` 브랜치)와 **토큰 구조·앱 셸·타이포/간격
스케일을 공유**하고, `--primary` hue만 분기한다 — pianoflow는 인디고(273), stayhome은
오션 틸(205). pianoflow 소스는 디스크에 없으므로 `git show pianoflow:pianoflow/<path>`로 읽는다.

- 앱 셸: `src/components/app-shell/AppShell.tsx` (데스크톱 사이드바 + 레일 접기 / 모바일 상단바
  + `BottomTabBar`). 내비 항목의 단일 출처는 `src/components/nav-items.ts`.
- 셸 지오메트리는 매직넘버가 아니라 토큰: `--app-sidebar-w` / `--app-sidebar-rail-w` /
  `--app-content-w`. `md:pl-(--app-sidebar-w)` 형태로 소비한다.
- 인증 화면은 `src/app/(app)/` 라우트 그룹 안에 둔다(URL 불변). `/login`·`/offline`은 셸 밖.
- 숫자(날짜·건수·소요시간)는 `font-mono tabular-nums`.
- **라이트 고정** — `<html style={{colorScheme:"light"}}>`. `.dark` 토큰은 준비만 돼 있고 켜지 않는다.
- 잔여 객실 상태색(`src/lib/availability-tone.ts`)만 테마 토큰이 아닌 Tailwind 리터럴 팔레트를
  쓴다. 브랜드가 아니라 의미색이고, primary 틸을 "예약 가능"에 쓰면 둘이 구분되지 않기 때문.
  JIT 때문에 클래스는 반드시 정적 리터럴.
- 브랜드 마크 기하는 `src/lib/brand-mark.ts` 한 곳 — 인라인 SVG(`app-mark.tsx`)와
  PWA 아이콘 PNG가 공유한다. 바꾸면 `npm run icons:generate` 재실행 필수.

## 코드 스타일 주의

- **`base-nova` shadcn 컴포넌트는 `asChild` 미지원.** Trigger 등에서 `render={<Button />}` 패턴 사용 (예: `src/components/ui/dialog.tsx`).
- **`Select` `onValueChange` 시그니처는 `(value: string | null) => void`** — null 가드 필요.
- **PrismaClient는 adapter 인자 필수** (Prisma 7 + `prisma-client` generator). seed/script도 동일.
- Prisma 생성물은 `src/generated/prisma/`. import 경로 `@/generated/prisma/client` 또는 `@/generated/prisma/enums`.
- Next 16 미들웨어 파일명은 **`src/proxy.ts`** (`middleware.ts` 아님).

## 보안 규칙 (감사 사항)

1. `ResortAccount.idEncrypted` / `pwEncrypted`는 절대 클라이언트로 평문 전달 금지 — `/api/admin/accounts/[id]/reveal`의 응답만이 유일한 합법 경로.
2. 복호화한 평문을 **호출자에게 돌려주는** 경로는 동일 호출에서
   `writeAudit({ action: REVEAL_CREDENTIAL, ... })` 작성 필수 — 현재
   `/api/admin/accounts/[id]/reveal` 하나뿐이다.
   크롤러(`run.ts`)는 복호화하지만 평문이 같은 프로세스 안 Playwright 폼 입력으로
   끝나고 밖으로 나가지 않으므로 대상이 아니다. 기계 실행 흔적은 `CrawlLog`가
   담당한다(`triggeredBy` · 시각 · 소요시간 · 결과 · 실패 단계).
   **"복호화하는 모든 경로"에서 좁힌 이유**: 크론이 리조트 수만큼 돌아 `audit_logs`가
   기계 실행으로 불어나면, "누가 평문을 봤나"라는 이 로그의 유일한 질문이 그 아래 묻힌다.
   (주기가 3시간에서 하루 1회로 줄었어도 판단은 같다 — 기계 실행 흔적은 `CrawlLog`의 일이다.)
   회귀 검사: `grep -rn "decrypt(" src/ | grep -v generated` → `run.ts` 2곳 +
   `reveal/route.ts` 2곳 + `lib/crypto.ts` 정의부. 새 호출부가 생기면 둘 중 어느
   칸인지부터 판정할 것.
3. `RESORT_CRED_SECRET`이 32바이트(base64 decode 후)가 아니면 `crypto.ts`가 에러를 던지도록 검증.
4. `/api/cron/*`, `/api/inngest/*` 외 모든 라우트는 `proxy.ts`에서 세션 검증.
5. **`ResortAccount.memo`는 암호화되지 않는다** — 평문 컬럼이고 `/admin/accounts`
   표에 마스킹 없이 렌더링된다(`AccountTable.tsx:146-147, 185`). 그런데 한화의
   **회원권 비밀번호**가 지금 거기 들어 있다(운영자 결정, 2026-08-13). 즉 `memo`는
   1·2번의 보호를 받지 않는 자리에 놓인 자격증명이다.
   · 크롤러는 `CrawlerContext.credentials.memo`로 받는다. `run.ts`가 `decrypt`를
     부르지 않는 유일한 자격증명이므로 2번의 `REVEAL_CREDENTIAL` 대상이 아니다
     (애초에 평문이고, 여기서도 Playwright 폼 입력으로 끝난다).
   · 등급을 올리려면 `ResortAccount`에 암호화 컬럼을 추가하는 별도 작업이다 —
     스키마 + Neon 마이그레이션 + 관리 폼 + `reveal` 라우트. 그전까지는
     **"메모에 비밀값이 있다"는 사실 자체가 알려져 있어야 한다.**
   · 회귀 검사: `grep -rn "credentials.memo" src/` → `hanwha/login.ts`의 사용 1곳 +
     `hanwha/config.ts`의 주석 1곳. 새 호출부가 생기면 그 리조트도 같은 노출을
     받아들이는지부터 판정할 것.

## 페이즈 진행 메모

- **Phase A (완료)**: 스캐폴드 / 인증 / 암호화 / 관리 UI / PWA 골격
- **Phase B (완료, 2026-07 재작성)**: lotteresort.com → lottehotel.com 통합에 맞춰
  롯데 크롤러 재작성. 로그인만 브라우저(L.POINT 탭), 검색은 roomList JSON API 직접 호출.
  상세는 `AGENTS.md` 참조.
- **Phase C (완료, 2026-08-05)**: Inngest 함수 + 크론 배선. 상세는 아래 "스케줄링" 절.
- **Phase D (구현됨)**: 검색 UI (`SearchView` + `/api/inventory`)
- **Phase E (완료, 2026-08-03)**: 프론트 전면 개선 + PWA 전환.
  앱 셸 도입(인라인 헤더 2벌 → `AppShell`), 조회 화면 재설계(날짜 스트립 + 박수 스테퍼 +
  지점 세그먼트 + 지점별 그룹), 관리 화면 모바일 카드/데스크톱 테이블 이원화,
  실제 아이콘 생성, 서비스워커 캐싱 + `/offline`, 설치 프롬프트 인앱 웹뷰 대응.
- **Phase E-2 (완료, 2026-08-05)**: 조회 UX 개선. 주간 날짜 스트립 → **월 캘린더**
  (`ui/calendar.tsx` + `search/StayRangeCalendar.tsx`, `react-day-picker` v10),
  조회 화면 **2단 레이아웃**(xl 이상: sticky 필터 패널 + 결과), 셸 여백 정리
  (`--app-content-w` 72→88rem — 1920px에서 사이드바-본문 공백 288→160px),
  결과에서 지점명·지역 위계 승격. 상세는 아래 "월 캘린더" 절.
- **Phase F 준비 (완료, 2026-08-06)**: 조회 화면 다중 리조트 일반화. 지점 메타의 단일
  출처를 `src/lib/resort-catalog.ts`(server-only)로 만들고 클라이언트의 크롤러 config
  import 제거, 필터를 리조트/지역/지점 3축 + 점진 노출로 재설계, "최신화"를 선택 지점의
  리조트로 라우팅. 상세는 아래 "조회 필터" 절.
- **Phase F 소노 (완료, 2026-08-09)**: 소노호텔앤리조트 크롤러 추가 → 리조트 2곳 운영.
  `src/crawlers/sono/` 6파일 + 배선 3곳(`registry` / `resort-catalog` / `active=true`),
  `REGION_ORDER`에 "부산" 추가, `run-crawl.ts` 슬러그·지점 인자화. 롯데 크롤러는 무수정.
  실사이트 검증: 32지점 169행 upsert 17초, 세션 재사용 4.4초, 지점명·지역 카탈로그 완전 일치.
  상세는 `AGENTS.md`의 "SONO 크롤러" 절.
- **Phase F 소노 최적화 (완료, 2026-08-09)**: 소노 응답이 "요청일 주변 23일"이 아니라
  **그 달 전체 달력**이고 `nights`가 재고에 무영향임을 실측으로 확인 → `InventoryRow.stay`
  도입(행이 자기 날짜를 신고), `run.ts`가 이미 답을 받은 윈도우를 스킵, `parse.ts`가
  숙박 일수만큼 AND. 60윈도우 → 요청 4번(40초·17,914행). 부수적으로 **2박 행이 체크인
  당일 상태만 보고 있던 기존 버그**가 고쳐졌다(예약가능 6,379→5,720행).
- **운영 개시 (2026-08-09)**: 프로덕션 배포 + Inngest 앱 sync 완료로 스케줄러가
  실제로 돌기 시작했다. 그전까지 자동 수집은 **한 번도 실행된 적이 없었고**,
  원인은 크론 설정이 아니라 `/api/inngest`가 모듈 로드 단계에서 500이었던 것이다
  (아래 "배포" 절). 첫 정기 실행(18:00 KST) 실측 — 소노 17,914행 / 패스 2번
  (42.5s + 21.7s), 롯데 78행 / 26.6s(로그인 포함). 60초 스텝 예산에 여유 있음.
- **Phase F 리솜 (완료, 2026-08-09)**: 리솜리조트 크롤러 추가 → **리조트 3곳 운영**
  (같은 날 `active=true`).
  `src/crawlers/resom/` 6파일 + 배선 2곳(`registry` / `resort-catalog`).
  `REGION_ORDER`는 무수정(충북·충남이 이미 있다). 사이트가 처음으로 **쿠키가 아니라
  베어러 토큰**을 요구해서, 토큰을 우리 쿠키에 넣어 `storageState`로 나르는 방식을
  썼다 — 상세는 `AGENTS.md`의 "RESOM 크롤러" 절. 응답이 날짜 달력이라 소노처럼
  `InventoryRow.stay`를 붙이고, 임의 범위를 지키는 API라 지점당 한 콜이 핫 윈도우를
  통째로 덮는다. 실사이트 검증: **60윈도우 → 58스킵·6콜, 4,186행 21초**.
- **Phase F 오크밸리 (완료, 2026-08-11)**: 오크밸리 크롤러 추가 → **리조트 4곳 운영**.
  `src/crawlers/oakvalley/` 6파일 + 배선 3곳(`registry` / `resort-catalog` / `seed.ts`의
  틀린 loginUrl). `REGION_ORDER`는 무수정(강원이 이미 있다).
  기존 셋과 구조가 다르다 — **로그인 SPA와 재고 JSP가 서로 다른 호스트**이고, JSP의 모든
  폼이 서버 생성 `ptSignature`를 요구해 리솜처럼 요청을 URL로 조립할 수 없다. 서명이
  세션에 묶여 재사용된다는 실측 덕분에 "패스당 페이지 1회 부팅 → 이후 평범한 POST"로
  풀었다(DOM을 몰지 않는다). 응답이 **월 단위이고 월말 꼬리가 없어** 두 달을 병합한 뒤에야
  행을 만드는, 수집·조립이 분리된 유일한 크롤러다.
  실사이트 검증: 콜드 로그인 포함 459행 24.2초, **핫 윈도우 60개 → 58스킵·요청 4번,
  909행 23.2초**. 상세는 `AGENTS.md`의 "OAKVALLEY 크롤러" 절.
  · 조사에서 하마터면 놓칠 뻔한 것: 폼 필드의 **id와 name이 달라서**(id `V_T_MONTH` /
    name `T_MONTH`) name으로 덮으면 달력이 **어느 달을 물어도 같은 달을 `success:true`로**
    답했다. 그래서 `debug-oakvalley.ts`에 `probe` 스텝이 있다 — 서명이 붙은 사이트에서는
    "성공"이 "반영됨"의 증거가 아니다.
- **Phase F 한화 (완료, 2026-08-13)**: 한화리조트 크롤러 추가 → **리조트 5곳 전부 운영**.
  `src/crawlers/hanwha/` 6파일 + 배선 4곳(`registry` / `resort-catalog` / `REGION_ORDER`에
  **서울** 추가 / `seed.ts`의 틀린 loginUrl). 지점 16곳이 붙어 전체 57지점이 됐다.
  구조가 오크밸리(호스트 둘)와 리솜(임의 날짜 범위 → 지점당 한 콜)의 조합이고,
  **처음으로 공용 코드가 바뀌었다** — 로그인이 아이디/비밀번호 다음에 별도 화면에서
  **회원권 비밀번호**를 요구해서, `CrawlerContext.credentials`에 `memo`가 생겼다.
  실사이트 검증: 콜드 로그인 포함 단일 윈도우 32.1초, **핫 윈도우 60개 → 57스킵 ·
  요청 16번 · 13,224행 35.6초**. 상세는 `AGENTS.md`의 "HANWHA 크롤러" 절.
  · 조사에서 하마터면 놓칠 뻔한 것: 지점이 16곳이라 **첫 윈도우는 예산에 걸리는 것이
    정상**인데, 그때 `stay`를 지우는 첫 구현이 46일치를 요청 윈도우 하나로 뭉개
    **5,520행을 120행으로 만들고 미래 날짜의 상태를 오늘 것으로 발행**했다.
    `rowsUpserted`만 봤으면 SUCCESS로 지나갔을 자리다.
- **정기 수집 재개 + 신선도 등급 (2026-08-24)**: 08-13부터 11일간 멈춰 있던 정기 수집을
  다시 켰다. 주기는 3시간마다가 아니라 **매일 09:00 KST 1회**(운영자 결정).
  멈춰 있던 11일 동안 드러난 것이 이 작업의 이유다 — 조회 화면이 "예약 가능"이라 말하는
  행의 **약 3분의 2가 일주일 이상 낡은 것**이었고, 운영자가 실제로 없는 방을 보고 갔다.
  · **낡음이 화면에 보이지 않았다.** `toneOf`는 시그니처에 `syncedAt`이 아예 없어서
    13일 된 행과 3분 된 행이 같은 초록 배지를 달았다. 이제 `src/lib/freshness.ts`가
    나이를 판정하고 `AvailabilityTone`에 `unverified`가 생겼다 — 낡은 "예약 가능"은
    중립 파선 배지 "N일 전 확인"으로 내려가고 요약 스탯·필터 칩 카운트에서도 빠진다.
  · **유령 행도 같이 고쳤다.** 쓰기 경로가 순수 upsert라 응답에서 사라진 객실의 옛 행이
    영원히 `available=true`로 남았다(속초 8/24 3행). `removeVanishedRows`가 답을 받은
    그룹 안에서 그것을 지운다 — 아래 "재고 upsert" 절.
  · 3박 이상은 핫 윈도우 밖이라 자동 갱신이 없다. 이제 그 사실이 화면에 "확인 필요"로
    보인다. 숨긴 게 아니라 원래부터 그랬던 것이 처음 보이는 것이다.

## 조회 필터 (Phase F 준비)

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
- 지점 후보가 8곳을 넘으면 칩 그리드 대신 검색 가능한 바텀시트(`PropertyPicker`).
  칩 그리드 컬럼 수는 **개수 비의존**이어야 한다 — 예전 `sm:grid-cols-5`는 옵션 5개에
  맞춘 값이라 지점 수가 바뀌면 마지막 줄에 조각 칩이 생겼다.

## 월 캘린더 (react-day-picker v10)

`src/components/ui/calendar.tsx`가 래퍼, `search/StayRangeCalendar.tsx`가 숙박 기간 선택 로직.

- **`timeZone="utc"` 필수.** RDP가 날짜를 `TZDate(date,"utc")`로 감싸 epoch을 보존해야
  `parseDate()`(UTC 자정)와 왕복한다. 빼면 브라우저 로컬 타임존에서 하루씩 밀린다.
- **`react-day-picker/style.css`는 import 하지 않는다.** v10은 덮어쓴 `classNames` 키의
  `rdp-*` 클래스를 버리므로 스타일시트는 죽은 규칙 + 토큰과 충돌하는 값만 남긴다.
- **`navLayout="around"` 금지** — `<nav>`를 건너뛰고 버튼을 `month`의 직계 자식으로 흘려
  `nav` 클래스가 아무 데도 안 붙는다. 기본 nav + `absolute inset-x-0 top-0`을 쓴다.
- **RDP는 modifier 클래스를 `join(" ")`할 뿐 `twMerge`를 안 돌린다.** 같은 요소에 상충하는
  Tailwind 유틸리티를 두면 승자가 스타일시트 순서로 결정된다. 그래서 주말 색은 요일 헤더에만,
  선택 스타일은 `[&>button]`으로 버튼에만 건다.
- 상태는 `checkin` + `nights`가 단일 진실이고 캘린더는 그 뷰다. RDP의 range 대수(`resetOnSelect`/
  `min`/`max`)에 위임하지 않고 `onSelect`의 `triggerDate`만 읽어 직접 해석한다 —
  `{from, to: undefined}`라는 무효 상태를 만들지 않기 위해서다.
- 로케일은 `react-day-picker/locale/ko` **서브패스**로 import (배럴은 date-fns 전 로케일을 끌고 온다).

## 스케줄링 (Phase C)

`src/lib/inngest/` + `/api/inngest` + `/api/cron/refresh` + `vercel.json`.

> **정기 수집은 돌고 있다** — `SCHEDULED_CRAWL_PAUSED = false`, **매일 09:00 KST 1회**
> (2026-08-24 재개). 멈출 때는 `pause.ts`의 상수와 `SCHEDULED_CRAWL_PAUSE_REASON`을
> **같이** 고칠 것. 멈추는 것은 팬아웃 두 경로뿐이고 이벤트 직접 발행과 "최신화" 버튼은
> 영향을 받지 않는다.
> **크론 트리거는 지우지 않는다** — 트리거를 지우면 Inngest 대시보드에서 "일부러 껐다"와
> "sync가 깨졌다"가 구별되지 않고, 이 프로젝트는 정확히 후자로 오래 고생했다(아래 "배포" 절).
> 멈춰 있을 때 하루 한 번 no-op 실행이 남는 편이 스케줄러가 살아 있다는 증거가 된다.

- **스케줄 주체는 Inngest 크론이지 Vercel Cron이 아니다.** Vercel Hobby는 크론을
  **하루 1회**로 제한하고, `0 */3 * * *` 같은 표현은 **배포 시 실패**한다
  (vercel.com/docs/cron-jobs/usage-and-pricing). Inngest는 자체 스케줄러로
  `/api/inngest`를 호출하므로 요금제 제약을 받지 않는다.
  `scheduled-refresh`가 `TZ=Asia/Seoul 0 9 * * *`(하루 1회)로 팬아웃한다.
  `vercel.json`의 `/api/cron/refresh`(12:00 KST)는 **Inngest 앱 sync가 깨졌을 때를 위한
  백스톱**이지 주 경로가 아니다 — `CRON_SECRET` Bearer 검증 필수. 그리고 **최근 6시간 안에
  SUCCESS가 있는 리조트는 건너뛴다**(그러지 않으면 하루 1회라는 결정이 무효가 된다).
  건너뛴 목록을 응답에 실으므로 "할 일이 없었다"와 "이 라우트도 죽었다"가 구별된다.
- **하루 1회는 매 실행이 콜드 로그인이다.** `ResortSession` TTL이 6시간이라 간격이 그보다
  길면 항상 만료된 세션으로 시작한다. 3시간 주기 시절의 "6시간 금지" 규칙(로그인 1회로
  실행 2회를 덮는다)은 이 주기에서 적용될 여지가 없다 — 대신 로그인 실패의 값이 비싸졌다.
  롯데는 로그인이 간헐적이라 하루 한 번뿐인 기회를 놓치면 24시간짜리 낡음이 되고,
  그 낡음은 조회 화면에서 "확인 필요"로 드러난다(`src/lib/freshness.ts`의 임계값 26시간이
  이 cron과 한 쌍이다 — 주기를 바꾸면 거기도 바꿀 것).
- **핫 윈도우 = 30일 × 1~2박 = 60개** (`src/lib/inngest/windows.ts`).
  `/api/inventory`가 `(checkinDate, checkoutDate)` 정확 일치라서 UI가 허용하는
  조합(임의 날짜 × 1~14박)을 전부 사전 수집하는 건 불가능하다. 핫 윈도우 밖은
  `POST /api/resorts/[slug]/refresh`(SearchView "최신화" 버튼)로 실시간 크롤한다.
  윈도우 배열은 **가까운 날짜부터** 정렬 — 예산이 끊기면 앞에서부터 잘리기 때문.
  · **60은 요청 수가 아니라 "채워야 할 칸" 수다.** 요청 하나에 여러 날짜를 답하는
    사이트는 행에 `stay`를 붙이고, `run.ts`가 그 패스에서 이미 답을 받은 윈도우를
    건너뛴다. 롯데는 윈도우×지점 그대로지만 소노는 60칸이 **요청 4번**(2개월 ×
    2숙박길이, 로그인 포함 40초)이다. 상세는 `AGENTS.md`의 "`InventoryRow.stay`" 절.
  · 리조트별 윈도우 목록을 여기에 두지 않는 이유도 같다 — 응답 폭은 크롤러만
    관측할 수 있어서, 스케줄러에 사본을 두면 어긋났을 때 "그 날짜만 조용히 빔"이 된다.
- **60초 우회는 "패스" 단위.** `runResortCrawl(slug, { windows, budgetMs })`가 브라우저
  **한 세션**으로 예산이 허용하는 만큼 윈도우를 돌고 `windowsCompleted`를 반환한다.
  `crawl-resort`는 `pending.slice(windowsCompleted)`로 남은 걸 다음 `step.run`에 넘긴다 —
  step마다 Vercel 60초 예산이 새로 잡히는 게 우회의 핵심. 로그인이 10~25초라 윈도우당
  호출하지 않고 배치로 묶는다.
- **재고 upsert는 다중행 `ON CONFLICT` 한 문장**(`upsertInventory`의 `$executeRaw`).
  행마다 `prisma.upsert`를 await 하면 Neon 왕복이 행 수만큼 발생해 윈도우당 ~5초가
  들었고(3윈도우 41.6초), 이게 패스당 윈도우 수 = 전체 스윕의 브라우저 기동 횟수를
  결정했다. **`$transaction([...upserts])`도 해결책이 아니다** — pg 드라이버 어댑터에서는
  여전히 문장별 왕복이라 기본 5초 트랜잭션 타임아웃에 걸린다. 한 문장으로 바꿔 9.2초.
  · 같은 INSERT가 동일 conflict target을 두 번 건드릴 수 없으므로 유니크 키 기준
    **선(先) 중복 제거** 필수. 유니크 키에 날짜가 포함되므로 중복 제거 키에도
    날짜가 있어야 한다 — 한 콜의 행들이 여러 날짜에 걸칠 수 있다.
  · 행당 바인드 파라미터가 12개라 Postgres 상한 65,535에 걸린다. `UPSERT_CHUNK_ROWS`
    (1,000행)로 끊는다 — 소노 한 콜이 ~3,900행이라 상한까지 1.4배밖에 안 남았었다.
  · 날짜는 Date가 아니라 `'YYYY-MM-DD'::date`로 바인딩 — Date는 timestamptz로 전송돼
    세션 TimeZone으로 캐스팅되고, 그게 이 앱의 UTC 자정 규약이 막으려는 하루 밀림이다.
- **응답에서 사라진 행은 지운다** (`removeVanishedRows`, `run.ts`). upsert만으로는
  어제 있었고 오늘 응답에 없는 객실이 옛 값 그대로 남아 영원히 `available=true`를
  주장한다 — 2026-08-24 롯데 속초 8/24가 그랬다(16행은 갱신, 호텔 3종만 08-11의
  "예약 가능"으로 잔존, 실제 사이트엔 없음).
  · 판정 단위는 `(지점, 체크인, 체크아웃)` 그룹이고 규칙은 **"그 그룹에서 1행 이상
    받았다면 사이트가 답한 것"**이다. **0행 그룹은 절대 건드리지 않는다** — 그룹 목록을
    방금 쓴 행에서 뽑으므로 자동으로 보장된다. 지점 단위 실패가 조용히 0행이 되기 때문에
    (`lotte/search.ts`가 예외를 삼킨다) 이걸 "전부 마감"으로 읽으면 크롤 실패가
    "전 객실 매진"으로 발행된다.
  · 판정 근거는 `synced_at <> now` 하나다. 이 호출이 쓴 행은 전부 같은 `now`를 갖는다.
    덕분에 파라미터가 행 수가 아니라 **그룹 수**에 비례한다(`DELETE_CHUNK_GROUPS`).
  · `available = false` 마킹이 아니라 **삭제**다. 사라진 행에는 "불가"와 "판정 못 함"이
    섞여 있고(소노·리솜·오크밸리·한화는 밤 하나가 결측이면 행을 안 만든다), 이 프로젝트의
    규약은 판정할 수 없으면 행을 만들지 않는 것이다.
  · 실측(2026-08-24): 롯데 3,742→3,739(속초 3행), 소노 18,018→18,010, 리솜·한화 변동 0,
    크롤하지 않은 윈도우는 무영향.
- **진전 0인 패스는 1회까지 정상.** 로그인에 예산을 다 쓴 첫 패스가 그렇고, 다음 패스는
  캐시된 세션을 쓴다. 연속 2회면 중단(`stalledPasses`).
- `runResortCrawl`은 실패를 던지지 않고 `status: FAILED`로 **반환**한다(CrawlLog를 닫아야
  하므로). 그래서 `crawl-resort`는 결과를 보고 **직접 throw** 해야 Inngest 재시도가 걸린다.
- Inngest 경계를 넘는 날짜는 항상 `"YYYY-MM-DD"` 문자열. 이벤트/step 결과는 JSON이라
  Date를 넣으면 ISO 타임스탬프 문자열로 돌아와 조용히 Date가 아니게 된다
  (`parseDate`/`toIsoDate`로 변환).
- 실패 알림은 `onFailure` → `notifySlack`(`SLACK_WEBHOOK_URL` 없으면 무동작).

## PWA

**빌드 플러그인을 쓰지 않는다.** Next 16은 Turbopack인데 Serwist/next-pwa는 webpack 설정을
요구한다 (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` §Extending 참조).
`public/sw.js`를 직접 작성한다.

- 캐시 전략: navigation → network-first + `/offline` 폴백 / `/api/inventory` → SWR /
  `_next/static`·`/icons` → cache-first / **그 외 전부 캐시 우회**.
- **`x-fresh: 1` 헤더는 SWR의 캐시본을 건너뛴다.** 라이브 최신화 직후 재조회에 붙인다 —
  안 붙이면 방금 크롤한 결과 대신 이전 캐시본이 먼저 그려져 갱신이 한 박자 밀린다
  (개발 모드는 워커 미등록이라 드러나지 않는다). `cache.match`는 요청 헤더를 무시하므로
  캐시 키는 쪼개지지 않는다.
- `/api/inventory` 응답 shape을 바꾸면 `CACHE_VERSION`을 올린다 — 낡은 본문이 새 코드에
  그대로 들어온다. `activate`가 `welfarestay-` 접두사 중 현행 아닌 캐시를 지운다.
- **개발 모드에서는 서비스워커를 등록하지 않는다** (`ServiceWorkerManager`가
  `NODE_ENV !== "production"`이면 조기 return). 예방 조치다 — `sw.js`는
  `_next/static`을 cache-first로 잡는데, 개발 중에는 브라우저에 워커가 끼어 있는 것만으로
  "코드를 고쳤는데 옛날 게 돈다"류의 진단이 어려워진다. (Turbopack 개발 청크 파일명에는
  콘텐츠 해시가 붙어 있어 cache-first 자체가 낡은 *내용*을 고정하지는 않는 것으로 확인됨.)
  dev 경로는 등록을 건너뛸 뿐 아니라 이전 세션이 남긴 워커·캐시를 제거하고 1회 새로고침한다.
- **인증된 HTML은 캐시하지 않는다** (의도적). 자격증명을 다루는 도구라 로그인 상태 HTML을
  디스크에 남기지 않는다. `/api/auth`·`/api/admin`·`/api/resorts`와 non-GET은 `shouldBypass()`가 차단.
- 로그아웃 시 `clearServiceWorkerCaches()`(`src/lib/sw-client.ts`)가 조회 캐시를 비운다.
- 아이콘: `npm run icons:generate` (sharp). 산출물은 커밋한다 — 빌드는 sharp를 실행하지 않는다.
- `/offline`은 `auth.config.ts`의 `isPublic`과 `proxy.ts` matcher **양쪽 모두**에서 제외돼야 한다.
- `sw.js`는 `next.config.ts`의 헤더로 no-store 처리 — 캐시되면 사용자가 낡은 워커에 묶인다.

## 배포 (Vercel)

프로젝트는 `zerogons-projects/stayhome` (`stayhome-khaki.vercel.app`).

- **함수 리전은 `icn1`(서울)이다** — `vercel.json`의 `"regions": ["icn1"]`. 기본값
  `iad1`(워싱턴)에서는 **롯데와 한화가 로그인 자체를 못 한다**: 롯데는 Imperva Advanced Bot
  Protection이 로그인 페이지 대신 `Pardon Our Interruption`을 돌려주고(그래서
  `login_01_001`이 아예 안 나간다), 한화는 첫 `page.goto`에서 `net::ERR_CONNECTION_RESET`이다
  — 지문 검사가 개입할 여지도 없이 **연결이 거부된다**. 같은 배포에서 소노·리솜·오크밸리는
  성공하고 같은 코드가 로컬(한국 IP)에서는 5곳 전부 통과하므로, 원인은 코드가 아니라 **출구 IP**다.
  · **Hobby도 리전을 고를 수 있다.** 제약은 "리전 1개"이지 "리전 고정"이 아니고,
    `icn1`(서울, ap-northeast-2)은 일반 리전 목록에 있다. 2026-08-23 이전 이 문서는
    "Vercel은 한국 리전이 없다"고 적고 있었다 — 틀렸고, 그 오기 때문에 가장 싼 선택지가
    2주 동안 검토에서 빠져 있었다.
  · **대가는 DB 왕복이다.** Neon이 `us-east-1`이라 쿼리당 ~200ms가 붙는다(Neon은 서울·도쿄
    리전이 없고, 기존 프로젝트의 리전은 변경 불가). 반대로 리조트 사이트 호출은 전부
    한국이라 줄어든다 — 지점마다 콜을 내는 한화(16콜)는 크롤이 오히려 빨라진다.
  · 확인은 `npx vercel inspect stayhome-khaki.vercel.app`의 람다 목록이 `[icn1]`인지.
    `functions`별 리전 분리는 Hobby에서 **불가능**하다(리전이 2개가 되는 순간 빌드 전에 실패).
- **크롤 한 번이 `/tmp`를 다 쓰면 다음 크롤이 죽는다** — 2026-08-23 실측·수정.
  Vercel 함수의 `/tmp`는 525MB이고 브라우저가 거기 산다. 새 인스턴스는 513MB가 비어 있는데
  한화 크롤 한 번이 끝나면 **17MB**가 남고, 그 워밍 인스턴스에 붙는 다음 크롤은 전부
  죽는다 — Inngest 재시도까지 같은 인스턴스로 가서, 무거운 크롤 하나가 리조트 다섯 곳의
  실패로 번진다. 증상이 고약한 건 **에러가 사이트 탓처럼 보인다**는 것이다:
  `net::ERR_INSUFFICIENT_RESOURCES`, `Target page, context or browser has been closed`,
  그리고 콜드 인스턴스에서 두 호출이 동시에 추출을 건드리면 `spawn ETXTBSY`.
  2026-08-09·08-11·08-20의 미제 실패가 전부 이거였다.
  · **주범은 `@sparticuz/chromium-min`이 남기는 `/tmp/chromium-pack`이다.** 이 라이브러리는
    팩을 거기 풀고 `chromium.br`·`fonts.tar.br`·`swiftshader.tar.br`를 `/tmp`로 다시 압축
    해제한 뒤 **압축본을 지우지 않는다.** 그런데 자기 `executablePath()`는 `/tmp/chromium`이
    있으면 조기 반환하므로, 두 번째 실행부터 그 팩은 **아무도 다시 읽지 않는 브라우저의
    압축된 사본**이다. `browser.ts`의 `dropExtractedPack()`이 `/tmp/chromium`이 있을 때만
    지운다 — 라이브러리가 조기 반환하는 것과 정확히 같은 조건이라, 있으면 죽은 코드고
    없으면 아직 원본이다.
  · **프로필 청소의 주인은 시계가 아니라 커널이다.** 예전 sweep은 5분보다 오래된
    `playwright_*`만 지웠는데, `/tmp`를 실제로 채우는 잔해는 다음 크롤이 시작할 때 몇 초밖에
    안 됐다 — 즉 아무것도 못 지우고 다음 크롤이 꽉 찬 디스크로 들어갔다. 이제
    `/proc/*/cmdline`에서 살아 있는 `--user-data-dir`를 읽어 **아무도 안 쓰는 프로필**을
    나이와 무관하게 지운다. 동시 실행 중인 크롤의 프로필은 우리 것과 똑같이 어리므로,
    나이 기준으로는 둘 다 살리거나 둘 다 죽이는 수밖에 없다.
  · **청소는 teardown에서도 돈다.** launch 직전에만 돌면 원리적으로 늦다 — 그 시점의
    잔해는 어떤 안전한 나이 기준보다도 어리고, 그게 끝났다는 걸 아는 건 그걸 만든 호출뿐이다.
  · `/tmp` 여유가 `TMP_LOW_MB`(120) 아래면 **무엇이 붙잡고 있는지 목록을 로그에 남긴다.**
    이 실패는 원인과 증상이 멀어서, 다음에 또 나면 로그가 스스로 이름을 대야 한다.
- **Playwright를 쓰는 라우트는 `outputFileTracingIncludes`가 필요하다.**
  `playwright-core`는 externalize되고 파일 80개가 트레이스에 들어가지만
  `browsers.json`만 빠진다 — import 시점에 `require`가 아니라 `fs`로 읽어서
  트레이서가 못 본다. 그러면 핸들러 코드가 돌기도 전에 모듈 로드가 실패해
  **500**이 나고, 증상이 지독한 이유는 **`next dev`에서는 멀쩡하다는 것**이다.
  대상은 `/api/inngest`와 `/api/resorts/[slug]/refresh` 둘. 검증:
  `grep browsers.json .next/server/app/api/inngest/route.js.nft.json`.
  · 이것 때문에 **Inngest 앱 sync가 처음부터 불가능**했다. sync는 Inngest가
    `/api/inngest`를 호출해 함수 목록을 읽는 것인데 그 요청이 `serve()`에
    닿지도 못했다. "크론이 안 돈다"의 원인이 크론 설정이 아니라 여기였다.
- **Git 연동이 붙어 있다** — `stayhome` 브랜치에 push하면 프로덕션 배포가 돈다.
  확인 방법은 배포의 별칭 목록에 `stayhome-git-stayhome-*`가 있는지
  (`npx vercel inspect <url>`). 별도 배포 명령은 필요 없다.
  (2026-08-09 이전 이 문서는 "Git 연결이 없다"고 적고 있었다. 틀렸다 —
  `VERCEL_GIT_*`가 함수 런타임에서 비어 보이는 것을 연동 부재로 읽은 것이다.)
- 환경변수는 Vercel에 Sensitive로 등록돼 있어 `vercel env pull`로 **되읽을 수 없다**
  (`[SENSITIVE]`만 나온다). 값 확인은 대시보드에서.
  **이미 돌고 있는 배포에는 소급되지 않는다** — 값을 바꿨으면 재배포해야 한다
  (`npx vercel redeploy stayhome-khaki.vercel.app`).
- **`CHROMIUM_PACK_URL`의 팩 버전은 `playwright-core`가 기대하는 크로미움과
  맞춰야 한다.** 기준은 `node_modules/playwright-core/browsers.json`의
  `browserVersion`이고, 팩은 Sparticuz 릴리스의 같은 메이저를 쓴다
  (playwright 1.60 → Chromium 148 → `chromium-v148.0.0-pack.x64.tar`,
  Vercel 함수는 x64). 한때 131 대 148로 17버전 벌어져 있었는데, 이 어긋남은
  launch까지는 성공하고 한참 뒤 CDP 호출이 이유 없이 실패하는 모양으로 나온다.
  playwright를 올릴 때 `@sparticuz/chromium-min`과 이 URL을 같이 올릴 것.
  · 값이 비어 있으면 `browser.ts`가 Vercel에서 **즉시 던진다**. 예전에는 조용히
    로컬 개발 분기로 새어 "npx playwright install 하세요"라는, 원인과 무관한
    메시지를 남겼다.

### Inngest 설정 (앱 sync)

Inngest는 크론·큐·재시도를 대행하는 외부 서비스다. 우리 코드는 함수 *정의*만
갖고 있고 실행은 Inngest가 시킨다 — 시간이 되면 `/api/inngest`를 HTTPS로 부른다.
**앱 sync**는 Inngest가 그 엔드포인트를 호출해 함수 목록과 크론을 읽어가는 절차이고,
이게 되기 전에는 Inngest가 우리 함수의 존재를 모른다.

- **Vercel 통합**(Inngest → Apps → Sync new app → Vercel)을 쓰면 배포마다 자동
  sync되고, `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY`도 Inngest가 직접 심어준다.
  수동 sync는 함수 정의를 바꿀 때마다 다시 눌러야 한다.
- **Deployment Protection이 sync를 막는다.** 프로덕션 별칭은 열려 있지만 Inngest가
  호출하는 것은 배포마다 생기는 *생성 URL*이고, 그건 `vercel.com/sso-api`로 302된다.
  Settings → Deployment Protection → **Protection Bypass for Automation** 시크릿을
  만들어 Inngest 설정에 넣으면 통과한다(보호를 끄지 않고 기계 하나만 통과시킨다).
  그 시크릿은 프로젝트 전 배포에 통하는 만능 열쇠이므로 저장소나 클라이언트에 두지 말 것.
- 판정: `curl -X PUT https://stayhome-khaki.vercel.app/api/inngest`
  → `{"message":"Successfully registered","modified":true}`면 성공,
  `{"message":"Your signing key is invalid"}`면 키가 아직 옛 값이다(재배포 확인).
  서명 없는 GET이 401인 것은 정상이다.

## 금액(요금) 수집 — 조사 결과 (2026-08-24)

"재고 옆에 금액도 보여줄 수 있는가"를 다섯 사이트 응답을 전수로 세어 확인했다.
도구는 각 `debug-*.ts`의 **`keys` 스텝**이다(오크밸리 `probe`·한화 `cal`과 같은 계보 —
저건 "성공한 응답이 옳은 응답은 아니다"를 재고, 이건 **"우리가 읽는 필드가 응답의 전부는
아니다"**를 잰다). 아직 스키마·크롤러·화면은 한 줄도 바뀌지 않았다.

| 리조트 | 금액 | 어디에 | 어떤 값 | 수집 비용 |
| --- | --- | --- | --- | --- |
| **롯데** | **있음** | 이미 받고 있는 `roomList` 안 | `roomAvgAmt`(1박 평균) · `minRateAmt` · `earlybirdRateAmt`. **BAR 공시가**(`memberType:""`) | **0** — 추가 호출 없음 |
| **리솜** | **있음** | 별도 `roomReservation/stockPrice` | `totalRmAmt`(총액) + `rmAmtList`(밤별) + `totalCmpnyRmAmt`(회사지원금). **회원가** | **행마다 1콜**, 0.2~1.8초 |
| 소노 | 없음 | — | 15개 키에 돈 없음 | — |
| 오크밸리 | 없음 | — | 14개 키에 돈 없음, `entitys2` 빈 배열 | — |
| 한화 | 없음 | — | 18개 키 중 `PP_DSCNT_RT`(할인율)·`SESN_NM`(시즌)만 | — |

**결정(2026-08-24): 리솜 회원가만, "최신화" 경로에서만 수집한다.** 롯데 공시가는 붙이지
않았다 — 공시가와 회원가를 같은 열에 놓으면 비교가 거짓말이 되고, 지금은 그 열에 설 것이
리솜뿐이다. 배선은 `ResortInventory.price`/`price_kind` + `SearchParams.withPrices` +
`CrawlerContext.deadlineAt`이고, 수집기는 `src/crawlers/resom/price.ts` 하나다.
상세와 실측은 `AGENTS.md`의 "### 요금 수집은 '최신화' 경로에만 있다" 절.

- **정기 수집은 요금을 한 번도 묻지 않는다.** 게이트가 둘이고(라우트의 `branch` 유무 →
  크롤러의 `branches.length === 1`), 어긋나면 증상이 항상 "요금이 안 나옴"이지
  "예산 초과"가 아니다.
- **요금은 행보다 낡을 수 없다.** upsert가 한 행을 한 문장으로 쓰므로 요금의 나이 =
  `synced_at`이고, 요금 없이 도는 다음 크롤이 null로 덮는다. `COALESCE`로 보존하면
  그 등식이 깨진다. 지워지지 않은 낡은 행은 화면의 `showsPrice(tone)`가 거른다.
- **`ctx.deadlineAt`이 새로 생긴 공용 개념이다.** 선택적 작업이 `withDeadline`을 넘기면
  잃는 것은 그 작업이 아니라 **이미 모은 재고 행 전부**라, 크롤러가 "몇 초 남았나"를
  알아야 했다. 한화·오크밸리의 `passBudgetMs`(상수 추정)와 같은 계보의 정확한 버전이다.

리조트별 상세와 근거는 `AGENTS.md`의 각 절 "### 요금…"에 있다. 판단에 필요한 것 넷:

1. **다섯 중 셋은 금액이 아예 없다.** 화면의 가치가 리조트 간 비교인데 2/5만 숫자가
   붙는다. 그마저도 롯데=공시가 / 리솜=회원가라 **같은 열에 놓으면 서로 다른 것을 비교**하게 된다.
2. **리솜은 값이 가장 좋은데 예산에 안 들어간다.** 회사지원금까지 주는, 담당자가 실제로
   안내할 숫자다. 그러나 SPA가 객실을 클릭할 때 한 번 부르는 콜이라 행 하나에 콜 하나이고,
   3지점 × 11객실유형 × 46일 ≈ **1,500콜**이다(패스 예산 30초). 사전 수집으로는 불가능하고,
   가능한 형태는 "선택한 한 객실만 그 자리에서" 정도다.
3. **롯데 숫자는 1박 값이지 총액이 아니다.** 총액은 `roomAvgAmt × 박수`이고, 그대로
   "N박 요금"이라 부르면 2박이 실제의 절반이 된다 — 2026-08-09에 고친 소노 2박 버그와 동형.
4. **필드가 있다고 값이 있는 게 아니다.** 리솜 `calendarRooms`에는 `rmAmt`가 있고 506행
   전부 `"0"`이다. 그대로 읽으면 전 객실을 0원으로 발행한다.

조사 과정에서 **기존 문서 두 곳이 틀렸던 것**도 드러났고 함께 고쳤다 —
오크밸리의 "엔티티 키 전량"은 6개가 아니라 14개였고(결론은 유지), 리솜 번들 주석의
`room/price/list`는 회원 객실이 아니라 **패키지** 요금이었다(접근자 이름이 양쪽 다
`selectRoomPrice`라 이름만 보고 고르면 다른 상품의 요금을 재고 옆에 붙이게 된다).

---

## 미해결 사항

- **롯데·한화가 Vercel에서 로그인하지 못한다 — 원인 확인됨(2026-08-23), 조치 배포 후 검증 대기.**
  로컬(한국 IP)에서는 5곳 전부 통과하는데 `iad1`에서만 이 둘이 실패한다. 런타임 로그가
  막힌 지점을 직접 말해준다:
  · **롯데** — 로그인 페이지 첫 GET의 응답이 `<title>Pardon Our Interruption</title>` +
    `distil_referrer`, 즉 **Imperva Advanced Bot Protection**의 챌린지 페이지다. 이후 홉에는
    `ssoLogin/lpointInit`만 두 번 있고 **`login_01_001`이 없다** — L.POINT가 인증을 시작조차
    하지 않았다. `AGENTS.md`의 판정 트리가 가리키는 "폼이 아니라 그 앞 문지기"가 이제
    가설이 아니라 관측이다. (2026-08-09에는 "4번에 1번 성공"이었는데 08-20·08-23 관측에서는
    콜드 로그인이 계속 실패했다 — 확률이 나빠졌다.)
  · **한화** — `www.hanwharesort.co.kr` 첫 `page.goto`에서 `net::ERR_CONNECTION_RESET`.
    브라우저 지문을 볼 기회도 없이 TCP가 끊기므로 IP 기반 차단이 거의 확실하다.
  · 조치는 코드가 아니라 **출구 IP**다 — 함수 리전을 `icn1`(서울)로 옮겼다(위 "배포" 절).
    이게 통하지 않으면 남는 해석은 "국가가 아니라 AWS 대역 또는 헤드리스 지문"이고, 그때는
    프록시도 같은 이유로 막힐 공산이 크다. 다음 선택지는 Neon 싱가포르 이전이거나
    Pro 업그레이드 후 크롤러 함수만 리전 분리다.
  · 이 조사 중에 **별개의 원인이 하나 더 드러났고 고쳤다** — `/tmp` 고갈. 아래 "배포" 절.
- **크론 실패가 아무 데도 통보되지 않는다.** `SLACK_WEBHOOK_URL`이 미설정이라
  `notifySlack`이 무동작이다. **하루 1회 배치에서는 더 아프다** — 한 번 놓치면 그 리조트는
  24시간짜리 낡음이고, 그 사이 조회 화면이 "확인 필요"로 덮인다. 사실상 필수 —
  실제로 롯데가 여러 번 죽었는데 로그를 직접 보지 않았으면 아무도 몰랐을 상황이었다.
- **`AllowedEmail`이 사문화됐다.** `prisma/seed.ts`가 채우기만 하고 `authorize()`는
  조회하지 않는다. Google OAuth → Credentials 전환의 잔재다. 제거(스키마 변경 +
  운영 마이그레이션)하거나 `authorize()`에서 확인하도록 되살리거나 — 1인용 도구에
  로그인 계정이 이미 DB 통제라 실익은 작다. 결정 전까지는 "있지만 아무것도 안 하는
  테이블"이라는 것만 알고 있을 것.
- 웹 푸시 **구독** 플로우(VAPID 키 · `web-push` · 구독 저장 테이블) 미구현.
  `sw.js`의 `push`/`notificationclick` 핸들러는 준비돼 있어 서버 쪽만 붙이면 된다.
  위의 Slack 알림과 목적이 겹치므로 둘 다 할 필요는 없다.
- 사전 존재 lint 오류 2건(`scripts/lotte-codegen.js`의 `require()`,
  `RevealDialog.tsx:38`의 set-state-in-effect) — 이번 작업 이전부터 있던 것.

(롯데 크롤러는 2026-07-26 실사이트 검증 통과: L.POINT 로그인 → 4개 지점 76행 upsert →
세션 재사용 확인 → `active=true` 적용 완료)
