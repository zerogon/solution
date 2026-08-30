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
- **크론 안정화 2차 (2026-08-26)**: 08-25의 전역 동시성 2가 `ETXTBSY`를 없앴지만
  같은 날 09:00 실행에서 **한화 혼자 5건** 실패했다. 데이터는 그때도 무사했다
  (핫 윈도우 60/60 × 5곳). 고친 것 다섯이고 뿌리는 하나 — **브라우저를 덜 띄운다.**
  · 전역 동시성 **2 → 1** (위 "스케줄링" 절).
  · `SESSION_LOST`를 **같은 패스 안에서** 회복 — 브라우저가 아니라 로그인으로.
  · **한화 로그인의 진짜 버그**: 이미 인증된 세션으로 로그인 페이지에 가면 사이트가
    폼을 그리지 않는데, `performLogin`이 `#id`를 25초 기다리다 죽었다. 08-25 09:02:47과
    08-26 09:03:04의 프로덕션 실패가 **자격증명 오류가 아니라 이것**이다. 즉 크롤러가
    자기가 이미 통과한 상태를 실패로 신고하고 있었다(`AGENTS.md`의 한화 절).
  · `checkLoggedIn`이 "사이트가 아니라고 답했다"와 "답을 못 들었다"를 구분한다 —
    후자에만 1회 재시도. 이 크롤러에서 "만료"의 값은 2화면 콜드 로그인이다.
  · 예산 산술에서 **쓰기 몫을 먼저 뗀다**, `closeBrowser` 포기 대기 10 → 5초,
    한화·오크밸리의 `passBudgetMs` 상수는 `ctx.deadlineAt`과 둘 중 **작은 쪽**으로.
  · `scheduled-refresh`가 1시간 넘게 `RUNNING`인 `crawl_logs` 행을 닫는다
    (하드 킬은 `finally`도 안 돌므로 예방이 아니라 회수다).
  · 실사이트 검증: 한화 콜드 60/60 13,104행 38.9초 · 소노 60/60 **35.7초**(종전
    프로덕션 59.3초) · 오크밸리 60/60 26.1초 · 리솜 60/60 15.9초 · 롯데 45행 15.4초.
    `SESSION_LOST` 회복은 `custNo`를 빈 값으로 강제해 확인 — 1회 회복은 SUCCESS,
    2연속 상실은 FAILED로 정상 포기.
- **크론 안정화 3차 (2026-08-27)**: 08-26의 조치 **둘이 서로를 악화시켜** 그날 09:00
  실행이 다시 무너졌다. 이번엔 전 과정이 `crawl_logs`에 남아 원인 사슬이 관측으로 이어진다.
  · **전역 동시성 1**이 다섯 리조트의 모든 패스를 한 워밍 인스턴스에 직렬로 몰아넣는다.
    09:01:09~09:05:19에 브라우저가 **7번 떴고 8번째에 끊겼다**(`ERR_INSUFFICIENT_RESOURCES`).
    동시성 1은 `/tmp` 압박을 없앤 게 아니라 **한곳에 몰아준 것**이었다.
  · **`CLOSE_TIMEOUT_MS` 5초 포기**가 그 인스턴스에 회수 불가능한 크로미움을 남긴다.
    포기된 프로세스는 살아서 `/proc`에 자기 `--user-data-dir`를 계속 이름 대고,
    `sweepStaleProfiles`는 사용 중 프로필을 **올바르게 영원히** 건너뛴다 — RSS도 같이
    붙잡힌다. 이 위험은 `browser.ts`의 주석에 **이미 적혀 있었다.**
    (⚠️ **이 문장의 뒷부분은 2026-08-29에 틀린 것으로 드러났다** — `profilesInUse`가
    크로미움의 cmdline을 못 읽어 그 건너뜀은 한 번도 일어나지 않았다. 아래 08-29 항목.
    잡히는 것이 프로필 **디렉터리**가 아니라 **프로세스의 RSS와 unlink된 fd**였을 뿐,
    "포기가 인스턴스를 마르게 한다"는 결론 자체는 그대로다.)
    (5초 자체는 옳았다. 틀린 것은 "포기해도 된다"는 전제였고, 그래서 값은 그대로 두고
    포기의 대가를 없앴다. 46초·42초 패스가 60초 벽에서 14초 남았으므로 teardown이
    쫄려서 생긴 일이 아니다 — 자원이 마른 브라우저일수록 close가 느릴 뿐이다.)
  · 피해가 **모양을 바꿨다**. 한화·롯데가 단일 슬롯을 번갈아 재획득하는 동안 소노·리솜은
    4분 넘게 굶었고, 인스턴스가 죽었을 때 그 둘은 부분 수집이 아니라 **0행**이었다.
  · 12:00 백스톱이 소노·리솜은 건졌지만 한화·롯데는 건너뛰었다 — 판정이 "최근 6시간 안에
    SUCCESS가 하나라도"였는데 둘 다 **미완주 SUCCESS**를 갖고 있었다. 그 결과 그날 저녁
    한화의 `available` 행 **3,949개**가 26시간을 넘겨 있었다(미래 윈도우 44/91).
  · 그리고 **09:05에 찍힌 진단을 읽을 수 없었다.** `browser.ts`가 `/tmp` 부족 시 남기는
    목록이 정확히 이 실패를 위해 있는데, Vercel Hobby는 런타임 로그를 보관하지 않는다.
  고친 것 여덟이고 뿌리는 하나 — **잔해를 남기지 않는다.**
  1. **포기된 브라우저를 실제로 죽인다.** launch 전후 `/tmp` 스냅샷 차집합으로 자기
     프로필을 특정하고(정확히 하나일 때만), close가 경주에 지면 그 경로를 `--user-data-dir`로
     갖는 pid를 SIGKILL한 뒤 디렉터리를 지운다. **모르면 아무것도 죽이지 않는다** —
     `/proc`을 못 읽거나 후보가 0개/2개 이상이면 종전 동작 그대로다.
  2. **하드 킬이 남긴 고아도 회수한다**(`reapOrphanBrowsers`). 60초 벽에서 죽으면
     `finally`가 안 돌아 1번이 닿지 못한다. 판정은 **프로세스 나이 90초** —
     `maxDuration`이 60초라는 플랫폼 사실이라 우리 장부가 틀려도 유효하다.
     **Vercel에서만 돈다**(로컬엔 그 상한이 없어, 손으로 모는 디버그 브라우저를 죽인다).
  3. **크로미움 자신의 `/tmp` 잔해도 훑는다**(`.org.chromium.Chromium.*` 등). 다만
     주력은 아니다 — `--disable-dev-shm-usage`가 만든 공유 메모리는 대개 **unlink된 채
     fd로 잡혀 있어** `readdir`에 안 보이고 어떤 sweep으로도 못 지운다. 그래서
     진단이 **`unaccountedMb`**(used − 눈에 보이는 합)를 같이 낸다. 이 숫자가 크면
     "잔해가 아니라 살아 있는 프로세스가 잡고 있다"는 뜻이다.
  4. **고갈이면 정직하게 실패한다.** `reclaimTmp` **뒤에** 다시 재고 `TMP_FLOOR_MB`(80MB)
     아래면 `TmpExhaustedError`를 던진다 — 브라우저를 띄우기 전에. 그리고 이 예외는
     Inngest 재시도 대상이 아니다(`NonRetriableError`): 재시도는 같은 워밍 인스턴스로
     가고, 동시성 1이라 **유일한 레인을 붙잡는다**(09:05~09:07이 그 청구서다).
  5. **자원 증거를 `crawl_logs`에 남긴다** — `[res] tmp 118→41MB, rss …, closeAbandoned=…`.
     실패 행엔 항상, 성공 행엔 여유가 얕거나 포기가 있었을 때만. 래칫은 실패 이전에
     **성공 행에서 먼저 보인다.** (`errorStage`는 여전히 진짜 에러에만 붙고,
     `/admin/crawl-logs`는 이 칸의 색을 내용이 아니라 **판정**으로 정한다.)
  6. **지점 호출을 병렬화해 패스 수를 줄인다**(`_shared/pool.ts`) — 아래 "지점 병렬" 절.
  7. **백스톱이 재고 신선도로 판정한다** — 아래 "백스톱" 절.
  · 그리고 **하지 않기로 한 것 하나**: 팬아웃 순서를 날짜로 회전시켜 "줄 끝의 불운"을
    나누는 조치를 구현했다가 되돌렸다. 확인해 보니 ① `orderBy: { slug: "asc" }`는
    Postgres enum이라 알파벳순이 아니라 **선언 순서**이고, ② 08-27의 실제 시작 순서가
    발행 순서와 달라 **Inngest는 동시성 제한 아래에서 발행 순서를 보장하지 않는다.**
    큐에 아무것도 약속하지 못하는 변경이라 근거와 함께 `targets.ts` 주석에만 남겼다.
    굶주림의 실제 치료는 6번(스윕 단축)과 1~2번(인스턴스가 마르지 않게)이다.
  · 실사이트 검증(2026-08-27, `CRAWL_BUDGET_MS=50000`): **한화 60/60 · 13,104행 ·
    30.7초 · 단 1패스**(종전 6패스, 첫 윈도우가 120행으로 잘리던 것이 사라졌다),
    롯데 27/60을 1패스 42.2초(종전 ~14/패스), 소노·리솜·오크밸리 60/60 무변경.
    포기 회수는 `CLOSE_TIMEOUT_MS`를 1ms로 강제해 확인(`reaped: true`, 프로필 삭제),
    고갈 거부는 `CRAWLER_TMP_FLOOR_MB`로 확인(브라우저를 띄우지 않고 즉시 던짐).
    DB 불변식 위반 0건, 한화 체크인 날짜 46개에 행이 고르게 분포(뭉갬 없음).

- **지점 제외 (2026-08-29)**: 제휴가 없는 지점을 운영자가 빼는 기능. 관리 화면
  `/admin/properties`(내비 "지점") + `scripts/set-exclusion.ts` + 서버 액션
  `src/actions/properties.ts`. 크롤 쪽은 `SearchParams.excludeBranches` 하나와
  `_shared/branches.ts`의 `selectBranches`로, 다섯 크롤러의 동일한 3줄 프롤로그를
  대신한다(`_shared/pool.ts`가 도입된 것과 같은 모양). 상세는 아래 "지점 제외" 절.
  · 새 테이블은 **목록이 아니라 빼는 규칙**이라 카탈로그의 "DB 사본 금지" 논증에
    걸리지 않는다 — 뺄 수만 있고 더할 수 없다.
  · **전 지점 제외는 막았다.** 그 상태의 리조트는 백스톱의 `covered === 0` 판정에
    걸려 매일 두 번 헛돈다. 리조트를 끄는 스위치는 `Resort.active`로 이미 있다.
  · 수렴 삭제를 `run.ts`가 아니라 `scheduled-refresh`에 둔 이유, `CACHE_VERSION`을
    일부러 올리지 않은 이유도 그 절에 적혀 있다.
  · 스키마는 마이그레이션 파일 없이 `npm run db:push`로 Neon에 반영했다(이 저장소에
    `prisma/migrations/`가 없다). `AuditAction`에 `EXCLUDE_PROPERTY`/`INCLUDE_PROPERTY`
    두 값이 늘었다 — 제외는 재고를 지우고 복구는 아무것도 만들지 않아 비대칭이라,
    `ADD_ALLOWED_EMAIL`/`REMOVE_ALLOWED_EMAIL`처럼 쌍으로 둔다.

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
- 지점 후보가 8곳을 넘으면 칩 그리드 대신 검색 가능한 바텀시트(`PropertyPicker`).
  칩 그리드 컬럼 수는 **개수 비의존**이어야 한다 — 예전 `sm:grid-cols-5`는 옵션 5개에
  맞춘 값이라 지점 수가 바뀌면 마지막 줄에 조각 칩이 생겼다.

## 지점 제외 (2026-08-29)

제휴가 없는 지점을 운영자가 뺀다. 관리 화면 `/admin/properties` + CLI
`scripts/set-exclusion.ts`. 뺀 지점은 **조회 화면에서 사라지고 정기 수집에서도 빠지며,
그 지점의 `resort_inventory` 행이 즉시 삭제된다.**

- **표는 "지점 목록"이 아니라 "빼는 규칙"이다.** `ResortBranchExclusion`은
  `(resortId, branchName)` 한 쌍이고 **행이 있으면 제외 · 없으면 노출**이다.
  `enabled Boolean`을 두지 않는 이유는 그 순간 "노출"을 뜻하는 상태가 둘(행 없음 /
  `enabled=true`)이 되기 때문이고, 해제된 규칙의 사유는 정보가 아니라 이력이라
  `audit_logs.metadata`(`EXCLUDE_PROPERTY`/`INCLUDE_PROPERTY`)가 담는다.
  · 카탈로그의 "DB 사본을 만들지 않는다"는 논증(위 "조회 필터" 절)에 걸리지 않는다 —
    이 표는 **뺄 수만 있고 더할 수 없다.** 이름이 어긋난 행은 아무것도 걸러내지 않는
    **무동작**이고, 실패 방향이 "지점이 사라짐"이 아니라 **"지점이 그대로 보임"**이다.
  · 그 무동작은 조용하므로 두 곳이 이름을 댄다: `excludeProperty`가 생성 시 `CATALOG`와
    대조해 거부하고, `/admin/properties`가 "카탈로그에 없는 제외 규칙"을 따로 그린다.
- **적용점은 크롤러가 아니라 `_shared/branches.ts`의 `selectBranches` 하나다.**
  다섯 크롤러가 각자 갖고 있던 동일한 3줄 프롤로그를 대신하고, 제외 목록은 `run.ts`가
  `ResortBranchExclusion`에서 **패스 시작에 한 번** 읽어 모든 윈도우에 얹는다
  (`findUnique`에 `include` 하나라 Neon 왕복이 늘지 않는다). `SearchParams`가
  **허용 목록이 아니라 제외 목록**을 받는 이유 둘: `run.ts`는 크롤러 config를 모르고
  (lazy `loadCrawler`가 `bizCd`류를 공용 모듈에서 막는다), 어긋난 이름이 허용 목록에서는
  "그 지점만 조용히 안 돎"인데 제외 목록에서는 무동작이다.
- **삭제는 두 층이다.** 즉시(서버 액션이 같은 트랜잭션에서 `deleteMany`) + 수렴
  (`scheduled-refresh`의 `purge-excluded-inventory`). 수렴이 필요한 이유는 경주 하나다 —
  크롤이 도는 중에 제외가 켜지면 그 지점 행은 아무도 다시 답하지 않고,
  `removeVanishedRows`는 **방금 쓴 행에서 그룹을 뽑으므로 구조적으로 닿을 수 없다.**
  그 스텝의 숫자는 평상시 0이어야 하고, 0이 아니면 "크롤이 제외와 경주했다"는 뜻이라 `warn`이다.
  · `run.ts`가 아니라 스케줄러에 둔 이유는 옆의 두 purge 스텝과 같다 — 크롤 경로에 Neon
    왕복을 더하지 않고, 정리가 실패해도 그날 수집이 안 도는 일이 없도록 팬아웃 **뒤**.
- **리조트의 마지막 지점은 뺄 수 없다**(`excludeProperty`의 가드, UI에서도 버튼 비활성).
  지점이 0곳이면 그 리조트는 매 핫 윈도우에서 0행이 되고 백스톱이 `covered === 0`을
  낡음으로 읽어 **09:00 크론에 더해 12:00 백스톱이 매일** 재수집한다 — 아무것도 없는 것을
  위해 브라우저를 하루 두 번 더 띄우고 `crawl_logs`에 "0행 SUCCESS"를 쌓는다.
  리조트를 끄는 스위치는 `Resort.active`로 이미 있고, 같은 뜻의 스위치를 둘 두지 않는다.
- **`/api/inventory`에는 필터를 걸지 않았다.** 기제는 *행이 걸러진다*가 아니라
  **행이 없다**이다. 조회 hot path가 매 요청 제외 표에 의존하게 만들지 않는다.
- **`sw.js`의 `CACHE_VERSION`도 올리지 않았다.** 규칙은 "응답 shape이 바뀌면"이고 shape은
  그대로다. 실제 영향은 한 프레임뿐 — `/api/inventory`는 SWR이고 칩 목록은 서버 렌더
  HTML인데 인증된 HTML은 애초에 캐시되지 않는다.
- **`reason`은 평문이고 관리 표에 마스킹 없이 그려진다.** `ResortAccount.memo`가 한화
  회원권 비밀번호를 담게 된 전례가 있어, 스키마 주석과 다이얼로그 placeholder가 무엇을
  적는 자리인지 직접 말한다. 보안 규칙을 여섯 번째로 늘리지는 않았다 — 자격증명을 담지
  않는 칸을 그 목록에 넣으면 "모든 항목이 진짜 비밀에 관한 것"이라는 값이 희석된다.
- 실사이트 검증(2026-08-29): 리솜 1지점 제외 후 크롤 로그에 그 지점 없음(1,472행 = 나머지
  2지점), 복구 후 60/60 4,186행으로 원상, 롯데 726행 삭제→재수집으로 **정확히 726행 복원**,
  소노 제외 시 조회 화면에서 사라지고 형제 지점은 남음, 오크밸리 1/2에서 마지막 지점 버튼
  비활성, 고아 규칙 삽입 시 경고 블록이 뜨고 조회 화면은 무변화(무동작 확인),
  `resort_inventory ⋈ resort_branch_exclusions` 위반 0건, 번들 유출 0건.

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
  백스톱**이지 주 경로가 아니다 — `CRON_SECRET` Bearer 검증 필수. 그리고 **이미 신선한
  리조트는 건너뛴다**(그러지 않으면 하루 1회라는 결정이 무효가 된다).
  · **신선함의 기준은 `crawl_logs`가 아니라 `resort_inventory`다**(2026-08-27에 바뀜).
    `buildHotWindows()`가 만든 60쌍을 그대로 질의에 넣어(날짜 지식의 사본을 만들지
    않는다) 리조트별로 가장 오래된 `synced_at`을 재고, 6시간을 넘으면 재수집한다.
    종전의 "SUCCESS가 하나라도 있으면 건너뜀"은 **미완주 수집을 완주로 셌다** — 08-27에
    롯데와 한화가 정확히 그렇게 빠졌고, 백스톱만이 그날 그것을 고칠 수 있었는데
    틀린 테이블을 보고 있었다.
  · 아는 대가: **유령을 품은 리조트는 매일 한 번 더 수집된다.** 0행으로 답한 그룹의
    옛 행은 `removeVanishedRows`가 손댈 수 없어 `min`을 계속 끌어내린다(실측: 다섯 곳
    전부 60/60 완주 직후에도 롯데 60.7시간). 짧은 크롤 하나이고 유령 청소가 7일에
    걷어내므로 수렴한다 — 반대 방향의 대가는 08-27에 이미 치렀다.
  · 리조트별 `{windowsCovered, oldestAgeHours, fresh}`를 응답에 실으므로 "할 일이
    없었다"와 "이 라우트도 죽었다"가 구별된다. **`?dryRun=1`**은 판단만 하고 보내지
    않는다 — 그게 없으면 이 라우트에 무슨 생각인지 묻는 행위 자체가 팬아웃이 된다.
  · ⚠️ **커버리지는 판정에 쓰지 않는다.** 롯데는 만실을 빈 `roomList`로 주므로 정말로
    네 지점 모두 마감인 날짜가 0행이고, 완주해도 50/60이다. 게이트로 쓰면 성수기 내내
    헛수고한다. 숫자는 보이되 판정하지 않는다.
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
- **그래도 못 지우는 유령이 있고, 그건 나이로 지운다** (`scheduled-refresh`의
  `purge-ghost-inventory`, 2026-08-27). `removeVanishedRows`는 **답을 받은 그룹 안에서만**
  지우고 0행 그룹은 절대 건드리지 않는다 — 그 규칙은 옳고 바꾸지 않는다(0행은 "전부 마감"과
  "이 지점 조회 실패"를 구별하지 못한다). 대가는 그런 그룹의 옛 행이 **영원히 남는다**는 것.
  · 실측(2026-08-27): 롯데 116행이 **16일째** `available=true`였고 74행이 예약 가능을
    주장했다. 리솜 754행 3.2일. **다섯 곳 전부 60/60 완주한 직후에도 그대로였다** —
    완주가 이걸 고치지 못한다.
  · `synced_at`이 **7일**보다 오래된 행을 지운다. 화면이 신뢰를 거두는 선
    (`AGING_MAX_MS`, 3일)보다 넉넉히 위여야 한다 — 3일에 맞추면 수집이 나흘 빠진 리조트의
    재고가 "N일 전 확인"으로 남는 대신 통째로 사라진다. 낡은 정보와 정보 없음은 다르고,
    화면은 이미 그 둘을 구별해 그린다. 어긋나면 조용히 틀리므로 **모듈 로드에서 던진다.**
- **지점 호출은 병렬로 나간다 — 패스 수를 줄이는 두 번째 방법** (`_shared/pool.ts`,
  2026-08-27). 패스 하나가 브라우저 하나이므로, 한 윈도우를 빨리 끝내는 것이 곧
  `/tmp` 압박을 줄이는 일이다.
  · `mapPool(items, limit, fn)`은 **절대 reject하지 않고** `{ok, value}|{ok, error}`를
    **입력 순서대로** 준다. 두 크롤러 모두 "한 지점 실패가 나머지를 죽이면 안 된다"를
    이미 지키고 있어서, 헬퍼가 그 규칙을 대신 어기면 안 된다.
  · **롯데는 4지점을 한 번에**(`LOTTE.branchPool`). 예산 게이트가 없어 상호작용이 없다.
    실측 1패스 14 → **27윈도우**.
  · **한화는 16지점을 4씩**(`HANWHA.branchPool`). 예약 호스트가 넷퍼넬 뒤에 있고 걸리면
    증상이 에러가 아니라 **응답 없음**이라, 병렬도를 올리는 것은 관측하고 나서 할 일이다.
    실측 **60/60 · 13,104행 · 30.7초 · 1패스**(종전 6패스).
  · 한화에서 조심할 곳 셋: 예산 게이트를 **배치 사이**로 옮기고 척도를 `slowestBatchMs`로
    바꿀 것(지점 단위 척도를 그대로 쓰면 벽시계를 4배 과소평가한다), `attempted`는 실제로
    디스패치한 수일 것, 그리고 **`truncated`의 `stay` 좁히기는 한 줄도 건드리지 말 것.**
  · **콜 타임아웃은 남은 예산에서 유도한다.** 순차에서는 게이트가 다음 지점 앞에서
    멈춰 세웠지만 배치에는 "다음"이 없다 — 25초짜리 낙오자 하나가 부분 반환을
    `DeadlineExceeded`로 바꿔 패스의 행 전부를 날린다.
  · 소노(서버가 배치를 받는다)·리솜(3지점)·오크밸리(2지점)는 손대지 않았다.
- **`crawl-resort`의 동시성은 리조트별 1 + 전역 1이다** (2026-08-26에 전역 2 → 1).
  앞의 것은 한 리조트의 두 패스가 `ResortSession`의 storageState 행을 두고 경쟁하지
  않게 한다 — 전역 1에 흡수돼 지금은 무동작이지만, 막는 이유가 다르므로 남겨 둔다.
  · **전역 2는 08-25에 골랐고 08-26이 반증했다.** 그날 `spawn ETXTBSY`는 사라졌는데
    (전역 제한이 실제로 들었다) 한화가 다시 5건 실패했고, **중간 실패 둘은 모두 다른
    크롤과 슬롯을 나눠 쓰던 구간**에서 났으며 혼자 쓴 구간은 3연속 성공이었다.
    산술이 애초에 2를 허용하지 않는다 — 이 문서의 실측이 "한화 크롤 한 번이 끝나면
    525MB 중 17MB가 남는다"이다.
  · 2를 고른 근거("재시도 백오프 중인 리조트가 나머지 넷의 머리를 막으면 안 된다")는
    그날의 관측이 아니었다. 한화가 09:05~09:08을 혼자 쓴 그 시각에는 **나머지 넷이
    이미 끝나 있었다.**
  · ~~**1이 청소 기구를 살려낸다.**~~ — 08-26의 두 번째 근거였고 **2026-08-27에
    약해졌다.** `reapOrphanBrowsers`는 프로필이 아니라 **프로세스 나이**(90초 >
    `maxDuration` 60초)로 판정하므로 동시 크롤이 있어도 옳게 회수한다. 즉 청소는
    더 이상 직렬화를 요구하지 않는다. 남은 근거는 위의 산술 하나이고 그것으로 충분하다 —
    청소는 **잔해**를 회수하지 살아 있는 브라우저를 줄여주지 않는다.
  · **그리고 08-27이 보여준 것: 1은 원인을 없애지 못하고 피해 범위를 바꾼다.** 직렬화는
    다섯 리조트의 모든 패스를 한 인스턴스에 몰아 래칫을 최대로 만들고, 줄 끝의 두 곳은
    부분 수집이 아니라 **0행**이 된다. 그 래칫을 끊는 것은 동시성이 아니라
    `browser.ts`의 회수이고, 줄 끝에 서는 것 자체는 우리가 정하지 못한다
    (`targets.ts` 주석 — Inngest 큐 순서는 발행 순서를 따르지 않는다).
  · 대가는 벽시계뿐이다(2레인 ~6.5분 → 1레인 ~11분, 지점 병렬화 후 ~5분대 기대).
    신선도 임계가 26시간인 하루 1회 배치에서 그건 대가가 아니다.
  · ⚠️ **Inngest는 `concurrency` 배열을 최대 2칸까지만 받는다**(`inngest/types.js`의
    `.max(2)`). "무거운 리조트 전용 레인"을 세 번째 제약으로 다는 것은 불가능하고,
    넣어도 sync가 warn만 하고 조용히 무시할 수 있다.
  · `/api/cron/refresh` 백스톱도 같은 함수로 이벤트를 보내므로 이 한 곳이 두 경로를
    함께 덮는다. "최신화" 버튼(`/api/resorts/[slug]/refresh`)은 Inngest를 거치지 않는다.

- **패스 예산은 검색 몫과 쓰기 몫을 따로 잰다** (`run.ts`의 윈도우 루프).
  종전에는 추정치가 하나였고, 그래서 **검색이 남은 예산을 전부 쓸 권한**을 가진 뒤
  그 위에 쓰기가 맨몸으로 얹혔다. 소노 한 윈도우가 12,000행이면 그 꼬리가 짧지 않다 —
  2026-08-26 프로덕션 패스가 **59.3초**로 `maxDuration` 60초에 1초를 남겼다.
  넘으면 하드 킬이고, 그때는 `finally`조차 돌지 않아 `crawl_logs` 행이 **RUNNING으로
  영원히 남는다.**
  · 이제 쓰기 몫(`upsertEstimateMs`)을 검색 예산에서 **먼저 뗀다**. 실측으로 한화
    쓰기 꼬리가 6.9초, 소노가 그 이상이다.
  · **`ctx.deadlineAt`은 패스의 끝이 아니라 그 검색이 잘리는 시각이고, 윈도우마다
    갱신된다.** 크롤러가 보는 시계와 `withDeadline`이 자르는 시계가 갈리면, 크롤러는
    자기가 가진 줄 아는 시간을 다 쓰고 그 초과분이 부분 반환이 아니라
    `DeadlineExceeded` — 즉 **이미 모은 행 전부의 소실**로 나타난다.
  · `closeBrowser`의 포기 대기가 10초 → **5초**(`CLOSE_TIMEOUT_MS`). 이 값이 예산
    위에 얹히는 시간의 지배항이다. 포기된 크로미움은 자기 프로필을 `/proc`에 계속
    이름 대므로 `sweepStaleProfiles`가 **영원히 건너뛴다** — 포기 한 번이 `/tmp` 한
    조각을 인스턴스가 죽을 때까지 고정한다.
    (⚠️ 08-29 정정: 그 건너뜀은 실제로는 일어나지 않았다 — `profilesInUse`가 빈 답을
    내고 있었다. 고정되던 것은 디렉터리가 아니라 프로세스 쪽이다. 아래 08-29 항목.)
  · `DEFAULT_BUDGET_MS + TEARDOWN_RESERVE_MS > 60초`면 모듈 로드에서 **던진다**
    (`crypto.ts`가 키 길이를 검증하는 것과 같은 모양). 이 초과는 증상이 조용하다.

- **세션을 잃었을 때 필요한 것은 로그인 한 번이지 브라우저 한 벌이 아니다.**
  `SessionLostError`가 검색에서 나면 `run.ts`가 **그 패스 안에서** 1회에 한해
  회복한다 — 세션 폐기 → 재로그인 → 저장 → 같은 윈도우 1회 재시도. 컨텍스트와
  페이지는 그 자리에 멀쩡히 살아 있다.
  · 종전에는 패스가 죽고 Inngest가 재시도했고, 그 재시도가 **더 마른 `/tmp`에
    브라우저를 새로 띄웠다.** 2026-08-26 09:07이 그 청구서다 — `SESSION_LOST` 하나가
    브라우저 두 벌을 더 태우고 둘 다 기동 2.8초 만에 죽어 함수가 최종 FAILED로 끝났다.
  · **패스당 1회.** 두 번째 상실은 전파한다(회복이 안 되는 상황을 두드리는 것은
    자원 부족으로 실패한 launch를 재시도하는 것과 같은 실수다).
  · **예산이 없으면 회복하지 않고 깨끗이 멈춘다.** 이미 커밋된 행을 회복 시도로
    날리지 않는 것이 이 제약의 전부다.
- **세션을 버릴지는 stage가 아니라 원인이 정한다**(`run.ts`의 catch).
  stage만 보면 양쪽으로 틀린다. **너무 성급하게** — `stage` 기본값이 `VALIDATE`이고
  `launchBrowser`는 그 뒤라, 브라우저가 뜨지도 않은 `ETXTBSY`가 멀쩡한 세션을 버렸다
  (그래서 `sessionUsable`이 컨텍스트가 실제로 선 뒤에야 true가 된다).
  **너무 소극적으로** — `SessionLostError`는 `SEARCH`에서 나므로 죽은 세션이 캐시에 남고,
  다음 시도의 `validateSession`이 그걸 통과시켜 로그인을 건너뛰고, 같은 실패가 돌아왔다
  (2026-08-25 09:05의 2연속이 그것이다).
  · `SessionLostError`(`_shared/errors.ts`)는 다섯 크롤러가 이미 쓰던 `SESSION_LOST:`
    접두사를 타입으로 올린 것이다. **로그인 호스트와 재고 호스트가 다른 크롤러**
    (한화·오크밸리)에서는 `validateSession` 통과가 크롤 가능을 뜻하지 않으므로,
    이 구분이 그 둘에게는 선택이 아니다.
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
  · **그리고 청소로는 풀리지 않는 두 번째 축이 있다 — 동시성**(2026-08-25 실측).
    위의 모든 조치는 "직렬 크롤이 남긴 잔해"를 겨냥한다. 그런데 팬아웃이 리조트 5곳을
    한꺼번에 보내면 **브라우저 다섯 벌이 동시에 살아 있고**, 그건 잔해가 아니라 현역이다.
    `sweepStaleProfiles`는 `/proc`을 물어 사용 중 프로필을 건너뛰므로(⚠️ **믿고 있던
    것이고 08-29에 틀린 것으로 드러났다** — 아래 08-29 항목) 이 압박 앞에서 회수할 것이
    하나도 없다. 525MB짜리 `/tmp`에 크로미움 추출본 하나와
    프로필 다섯이 들어가지 않는다는 것이 전부다.
    같은 뿌리에서 증상이 둘로 갈린다 — 콜드 인스턴스에서는 `/tmp/chromium`을 동시에
    푸느라 **`spawn ETXTBSY`**, 그 뒤로는 **`ERR_INSUFFICIENT_RESOURCES`**.
    조치는 `crawl-resort`의 **전역 동시성 제한**이다(아래 "스케줄링" 절).
    `launchBrowser`의 `ETXTBSY` 한정 재시도는 그 뒤에 남는 좁은 창을 막는 보조 장치일 뿐,
    **자원 부족으로 인한 launch 실패는 재시도하지 않는다** — 더 마른 `/tmp`를 한 번 더
    두드리는 일이고, 두 번째 실패는 더 늦게 오면서 똑같이 읽힌다.
  · **그리고 세 번째 축이 있었다 — 아무도 세지 않은 잔해 한 종류**(2026-08-29).
    그날 09:00 팬아웃에서 오크밸리·리솜·소노가 `TMP_EXHAUSTED`로 거절됐다
    (롯데 2패스·한화 1패스는 그 앞에서 SUCCESS). **이 프로젝트 최초의
    `TMP_EXHAUSTED`이고, 08-27에 만든 거절 경로가 설계대로 동작한 것이다** — 거절
    메시지가 범인의 이름을 직접 댔다: `core.chromium.18` 298MB · `core.chromium.109`
    100MB. 커널 코어 덤프다.
    · **`--single-process`로 뜬 크로미움이 끝날 때 segfault한다.** 패스는 SUCCESS였고
      `browser.close()`도 정상 resolve했으니 죽는 순간의 사고이고, 덤프 크기가 그
      프로세스의 RSS다(298MB·100MB ↔ 그 시각 teardown의 346MB·410MB). SIGKILL은 코어를
      남기지 않으므로 회수 장치들은 범인이 아니다 — **잘 닫힌 브라우저가 남기는 잔해다.**
    · **판별의 결정타는 `목록에 없는 0MB`였다.** 살아 있는 프로세스가 unlink된 fd로
      붙잡은 게 아니라 이름이 멀쩡한 파일이 그냥 거기 있었다. `unaccountedMb`를 로그에
      넣어둔 이유가 정확히 이 갈림이다.
    · 조치는 `CORE_DUMP_NAME`. **나이 기준을 붙이면 안 된다** — 덤프는 teardown 그
      순간에 생기고 그걸 지울 유일한 호출도 같은 teardown의 `reclaimTmp`라,
      `STALE_PROFILE_MS`(90초)를 걸면 언제나 건너뛰어진다(08-29의 간격은 43초·33초).
      코어 덤프는 잔해 중 유일하게 **주인이 존재할 수 없는** 종류다.
    · 예방(덤프를 안 만들기)은 **하지 않았다.** Node에 `setrlimit` 바인딩이 없고
      `core_pattern`은 `/proc/sys`이며 `chromium.launch()`는 `cwd`를 안 준다. 진짜
      레버는 `PACK_ARG_GROUPS.isolation`을 떼는 것인데 그건 **측정된 실험**이지 버그
      수정이 아니다. 대신 `coreDumpPolicy()`가 low-`/tmp` 분기에서 `core_pattern`과
      코어 크기 상한을 찍는다 — 스윕으로 부족해지면 그때 그 레버를 당긴다.
    · 회수는 `crawl_logs`에 `cores=1/298MB` 꼴로 남는다. Hobby가 런타임 로그를 안
      남기므로 **그 칸이 래칫이 끊겼다는 유일한 지속적 증거**다. 성공 행에도 붙는데,
      08-27의 "래칫은 실패 이전에 성공 행에서 먼저 보인다"와 같은 판단이다.
  · ⚠️ **그리고 검증 중에 별개의 버그가 드러났다 — `/proc` 파싱이 한 번도 맞은 적이
    없었다**(2026-08-29). **크로미움은 자기 argv를 공백으로 연결한 문자열 하나로
    덮어쓴다**(리눅스 프로세스 타이틀 방식). `profilesInUse`는 `split("\0")` 후
    `startsWith("--user-data-dir=")`를 봤으므로 그 원소가 **영원히 없었다.** 대가 둘,
    둘 다 조용하다:
    · `sweepStaleProfiles`가 **살아 있는 프로필을 지웠다**(로컬에서 재현 — 브라우저가
      도는 중에 그 `--user-data-dir`가 사라졌다). 위 08-25·08-27 항목이 "사용 중
      프로필은 올바르게 건너뛴다"고 적어둔 것이 사실이 아니었다.
    · `reapAbandoned`가 pid를 못 찾아 "혼자 끝났다"로 판정하고 **SIGKILL 없이**
      `reaped: true`를 신고했다 — 08-27이 만든 회수 장치가 무동작이면서 성공을 보고하고
      있었다는 뜻이다. 프로덕션 로그의 `closeAbandoned=reaped`는 그래서 액면대로 읽으면
      안 된다.
    조치는 NUL **과 공백 둘 다**로 자르는 것(프로필 경로에는 공백이 없다). 로컬 검증:
    고친 뒤 살아 있는 프로필이 옆 크롤의 스윕에서 살아남고, 같은 스윕이 코어는 지운다.
    · 📌 **아직 안 물어본 것**: 고친 `reapAbandoned`가 프로덕션에서 실제로 죽이는가.
      확인은 런타임 로그의 `[browser] reaped abandoned browser {pid}` 유무이고,
      Hobby는 그걸 보관하지 않는다. 필요해지면 `reaped`를 "죽였다"와 "이미 없었다"로
      갈라 `crawl_logs`에 실을 것 — 지금은 실패 경로가 드물어 미뤘다.
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

**2026-08-25 보강**: `keys`가 답하는 것은 *우리가 읽는 응답*까지이고, "그 화면이 부르는
다른 콜"(Q2)까지 실제로 쓸어본 곳은 오크밸리·한화 둘뿐이었다. 소노는 재고 응답만
근거로 "없음"이라 적혀 있었다 — 리솜이 정확히 그 너머에서 뒤집혔던 자리다.
그래서 `debug-sono.ts`에 **`flow` 스텝**을 추가해 예약 흐름을 객실 선택 단계까지 몰았고,
소노판 `stockPrice`인 `POST memberReservation/room/detail`을 찾았다.
**결론은 유지된다 — 거기에도 요금이 없다**(자세한 것은 `AGENTS.md`의 소노 절).
계보의 세 번째 질문인 셈이다: **"우리가 읽는 응답이 그 화면의 전부는 아니다."**

| 리조트 | 금액 | 어디에 | 어떤 값 | 수집 비용 |
| --- | --- | --- | --- | --- |
| **롯데** | **있음 · 수집 중** | 이미 받고 있는 `roomList` 안 | `roomAvgAmt`(1박 평균) · `minRateAmt` · `earlybirdRateAmt`. **BAR 공시가**(`memberType:""`) | **0** — 추가 호출 없음 |
| **리솜** | **있음** | 별도 `roomReservation/stockPrice` | `totalRmAmt`(총액) + `rmAmtList`(밤별) + `totalCmpnyRmAmt`(회사지원금). **회원가** | **행마다 1콜**, 0.2~1.8초 |
| 소노 | 없음 | — | 재고 15개 키 + **객실 선택 단계 `room/detail` 34개 키**에도 돈 없음 | — |
| **오크밸리** | **있음 · 수집 중** | 예약 API 아님 — **공개** `api/v1/village`의 `roomPriceTable` | 회원 요금표 + **시즌 달력**. `memberTable`(계산값) | **0** — 패스당 공개 GET 1회 |
| 한화 | 예약 API엔 없음 | 공개 `rs_room.do?bp_cd=…` 요금표 | 시즌은 응답이 직접 준다(`SESN_NM` 8종). **조인 미완** — 아래 | — |

**결정 1 (2026-08-24): 리솜 회원가만, "최신화" 경로에서만.** 배선은
`ResortInventory.price`/`price_kind` + `SearchParams.withPrices` + `CrawlerContext.deadlineAt`,
수집기는 `src/crawlers/resom/price.ts`. 상세는 `AGENTS.md`의 "### 요금 수집은 '최신화'
경로에만 있다" 절.

**결정 2 (2026-08-26): 롯데 공시가도 붙인다 — 화면이 종류를 말하게 하고서.**
08-24에 붙이지 않은 이유는 "공시가와 회원가를 같은 열에 놓으면 비교가 거짓말이 된다"였다.
그 진단은 옳았고 **처방이 틀렸다** — 거짓말을 막는 것은 숫자를 빼는 것이 아니라 이름을
붙이는 것이고, 이름표(`price_kind`)는 그때 이미 스키마에 있었다. 빠져 있던 것은 그것을
**보이게 그리는 일**뿐이었다(그전까지 `title` 툴팁에만 있었고, 툴팁은 이 PWA가 실제로
쓰이는 폰에 존재하지 않는다).

- **요금 종류는 섹션 헤더에 한 번 쓴다**(`BranchResultSection`). 한 지점은 곧 한 리조트라
  그 섹션의 종류는 하나고, 행마다 반복하면 좁은 화면에서 객실명을 잡아먹는다. 그래도
  집합으로 구하는 이유는 그 "하나"가 컴포넌트의 보장이 아니라 크롤러들의 현재 사실이기
  때문이다.
- **어휘 확장은 마이그레이션이 아니다.** `price_kind`는 Prisma enum이 아니라 text이고
  단일 출처는 `src/lib/price.ts`의 TS 유니언이다. 값을 늘릴 때 `PriceKind` ·
  `PRICE_KIND_LABEL` · `isPriceKind` **셋을 같이** 늘려야 한다 — 어긋나면 에러가 아니라
  `/api/inventory`가 그 요금을 조용히 null로 떨어뜨린다.

- **"정기 수집은 요금을 묻지 않는다"는 이제 리솜에 한정된 문장이다.** 게이트
  (라우트의 `branch` 유무 → 크롤러의 `branches.length === 1`)는 **비용**을 재는 장치이지
  요금 일반의 금지가 아니다. 롯데는 비용이 0이라 그 게이트를 타지 않고 정기 수집에서도
  붙는다. 게이트가 어긋났을 때의 증상이 항상 "요금이 안 나옴"이지 "예산 초과"가 아니라는
  성질은 그대로다.
- **롯데 금액은 1박 평균이라 박수를 곱해야 한다**(`lotte/parse.ts`의 `stayTotal`).
  `InventoryRow.price`의 계약이 "숙박 **전체**의 요금"이라, 곱하지 않으면 2박이 실제의
  절반으로 발행된다 — 2026-08-09에 고친 소노 2박 버그와 같은 모양이다.
  실측 회귀 검사는 "같은 방의 2박 총액이 1박 총액보다 작은 행 0건".
- **예약할 수 없는 방에는 붙이지 않는다.** `roomList`는 매진된 방(대기예약)도 실어 보내고
  거기에도 금액이 있다 — 가용성을 안 보면 실측 113행이 `available=false`인 채 요금을
  갖는다. 화면의 `showsPrice(tone)`가 어차피 거르지만, DB에 두면 불변식이 깨진다.
- **요금은 행보다 낡을 수 없다.** upsert가 한 행을 한 문장으로 쓰므로 요금의 나이 =
  `synced_at`이고, 요금 없이 도는 다음 크롤이 null로 덮는다. `COALESCE`로 보존하면
  그 등식이 깨진다. 지워지지 않은 낡은 행은 화면의 `showsPrice(tone)`가 거른다.
**결정 3 (2026-08-26): 오크밸리는 공표된 요금표로 계산해서 붙인다.**
`keys`가 "요금 없음"으로 닫아둔 것은 **예약 API에 대해서** 사실이었다. `axes` 조사가
다른 문을 찾았다 — `GET api.oakvalley.co.kr/api/v1/village`(무인증)의 `roomPriceTable`에
회원 요금표와 **시즌 달력 자체**가 들어 있다. 상세는 `AGENTS.md`의 오크밸리 절.

- **계산값은 견적이 아니다.** `price_kind`가 `memberTable`로 구별하고 화면이 그렇게 쓴다.
- **요금표의 어느 열인지는 사이트가 말해주지 않는다.** 기명/무기명/회원대여가가 최대 27%
  차이인데 `getRoomMember`에 그 축이 없다. `OAKVALLEY.rateFare = "기명"`은 **관측이 아니라
  운영자의 답**이고, 그 사실이 상수 주석에 적혀 있다.
- **밸리 31평·46평은 붙이지 않는다.** 요금표에 `(일반)`·`(노블)` 두 줄이 있는데 재고에는
  그 축이 없다(`RM_RMTYPE` → `SEC_DIV`가 1:1이다) — 사이트가 두 등급을 한 예약 단위로
  접고 있어서, 어느 값을 골라도 절반은 틀린다.

**한화는 멈췄다 (2026-08-26 `axes`).** 불가능해서가 아니라 배선 하나가 아니라서다.
시즌은 사이트가 날짜마다 직접 준다(`SESN_NM` 8종, `SESN_CD`와 1:1, **날짜 단위**) —
여기까지는 오크밸리보다 유리하다. 막은 것은 셋: **객실유형이 107종**(오크밸리는 9종),
요금표가 `bp_cd`라는 **다른 코드 체계**에 있고(`bp_cd=0100`은 빈 페이지, `1101`은 요금표),
회원 등급(무기명·기명·회원추천)을 사이트가 말해주지 않는다(`USER_CALC_GRAD_CD`가 빈 값).
상세는 `AGENTS.md`의 한화 절.

**소노는 하지 않는다.** 요금표가 연 단위 PDF인 것보다 우리 쪽이 먼저 막힌다 —
`sono/parse.ts`가 평형·뷰 변형을 접어 **조인 키를 읽는 순간 지운다**(실측 150그룹 중
90그룹이 2개 이상 접힘). 되돌리는 것은 요금 작업이 아니라 재고 의미를 바꾸는 작업이다.

- **`ctx.deadlineAt`이 새로 생긴 공용 개념이다.** 선택적 작업이 `withDeadline`을 넘기면
  잃는 것은 그 작업이 아니라 **이미 모은 재고 행 전부**라, 크롤러가 "몇 초 남았나"를
  알아야 했다. 한화·오크밸리의 `passBudgetMs`(상수 추정)와 같은 계보의 정확한 버전이다.

리조트별 상세와 근거는 `AGENTS.md`의 각 절 "### 요금…"에 있다. 판단에 필요한 것 넷:

1. **다섯 중 셋은 금액이 아예 없다.** 화면의 가치가 리조트 간 비교인데 2/5만 숫자가
   붙는다. 그마저도 롯데=공시가 / 리솜=회원가라 **같은 열에 놓으면 서로 다른 것을 비교**하게 된다.
   · 이 "없다"는 이제 셋 다 Q2까지 물어본 없다다(오크밸리 다른 서블릿 · 한화 게이트웨이
     INTF_ID 전수 · 소노 `flow`의 객실 선택 단계). 셋의 공통점은 **회원 콘도식 예약**이라
     달력에서 방을 먼저 잡고 요금은 그 뒤에 계산된다는 것이다 — 한화가 그 증거를 직접
     보여준다(`PP_DSCNT_RT` 할인율과 `SESN_NM` 시즌은 주면서 금액은 안 준다).
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

## 인원(기준·최대) 수집 (2026-08-28)

"이 방 몇 명까지 되나"가 화면에 없어 매번 리조트 사이트를 다시 열어야 했다. 금액 조사와
**같은 자리에서 같은 방식으로** 답이 나왔다 — 롯데 `roomList`의 49키 중 우리가 선언한 건
6개뿐이었고, 요금(`roomAvgAmt`)에 이어 이번엔 `capacity`/`maxCapacity`가 거기 있었다.

- **롯데만 수집한다.** 비용 0(이미 받는 응답 안)이라 `withPrices` 같은 게이트를 타지 않고
  정기 수집에서 붙는다. 상세와 실측은 `AGENTS.md`의 "### 인원도 같은 자리에 있었다".
- **저장은 `ResortInventory.stdCapacity`/`maxCapacity`**, 크롤러 계약은
  `InventoryRow.occupancy?: { standard, max }` — `price`·`stay`와 같은 **한 덩어리** 규약.
  `/api/inventory`가 두 컬럼을 하나로 접어 내려보내는 것도 같은 이유다.
- **요금과 딱 한 군데서 갈린다 — 가용성·신선도 게이트가 없다.** `showsPrice(tone)`가
  존재하는 이유는 "값이 시간에 따라 변하는데 숫자에는 자기를 부인할 어휘가 없다"인데,
  정원은 변하지 않는다. 매진된 방도, 13일 된 행도 6인용이면 6인용이다. 이 비대칭이
  의도라는 것이 `lotte/parse.ts`와 `BranchResultSection.tsx` 주석에 적혀 있다.
- **행당 바인드 파라미터가 14 → 16**이 됐다. `run.ts`의 `UPSERT_CHUNK_ROWS` 주석에 있는
  상한 계산(65,535 ÷ 16 ≈ 4,095)도 같이 고쳤다 — 1,000은 여전히 안전하지만 주석이
  거짓이 되면 다음 사람이 그 숫자를 믿는다.
- `/api/inventory` 응답 shape이 바뀌었으므로 `sw.js`의 `CACHE_VERSION`이 v3 → **v4**.

**나머지 넷은 아직 조사 전이고, 재고 응답에는 없다는 것까지가 확인된 상태다.**
소노 `rmTypeList` 15키 · 한화 `ds_result` 18키 · 오크밸리 `getCalendar` 14키 전수에 없고,
오크밸리는 공개 `api/v1/village` 응답 전문에도 `인원`·`정원`이 0건이다. **리솜만 키를
세어본 적이 없다**(다섯 중 유일). 남은 조사는 `keys` 스텝을 그대로 쓰면 된다 —
`keyCensus`에 이름 필터가 없어 요금 전용 로직이 아니고, `valueAlphabet`이 distinct ≤ 12면
값을 전부 나열하므로 정원은 `{2, 4, 6} min=2 max=6` 형태로 오히려 요금보다 잘 보인다.

- 순서는 로그인 비용순: 오크밸리(`api/v1/village` 무인증) → 소노 → 리솜 → 한화(2화면 +
  회원권 비밀번호라 가장 비싸다). 법인 실계정이라 반복 로그인은 잠금 위험이다.
- 소노 `flow`의 `reportMoney`는 `MONEY_KEY`에 인원 어휘가 없고 값 기준이 `>= 1000`이라
  **정원을 구조적으로 못 잡는다** — 그 출력이 아니라 `keyCensus` 블록을 볼 것.
- 리솜은 `keys` 출력의 **첫 census(`allCondos[].roomTypeList[]`)가 정적 정원의 1순위**다.
- ⚠️ **정원이 재고 응답이 아니라 정적 소스(객실 소개 페이지 등)에만 있다면 그건
  `ResortInventory` 컬럼이 아니다.** 정기 크롤이 매번 그 컬럼을 null로 덮게 되고
  (`run.ts`의 COALESCE 금지), 그건 요금에서는 정의였지만 정원에서는 버그다. 그때는
  객실 마스터로 가는 별도 판단이고, 카탈로그 모듈이 사본 드리프트를 막는 방식을
  먼저 볼 것(`resort-catalog.ts` 주석).
- 소노는 값이 나와도 붙일 자리가 없을 공산이 크다. `sono/parse.ts`가 평형·뷰 변형을 한
  행으로 접어서(150그룹 중 90그룹) 접힌 행에 "그 방의 기준인원"이라는 단일 값이 없다 —
  요금에서 부딪힌 것과 같은 벽이다.

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
- **크론 실패가 아무 데도 통보되지 않는다 — 운영자 작업 대기 중.**
  `SLACK_WEBHOOK_URL`이 미설정이라 `notifySlack`이 무동작이다. **하루 1회 배치에서는 더
  아프다** — 한 번 놓치면 그 리조트는 24시간짜리 낡음이고, 그 사이 조회 화면이
  "확인 필요"로 덮인다. 사실상 필수 — 실제로 롯데가 여러 번 죽었는데 로그를 직접 보지
  않았으면 아무도 몰랐을 상황이었다. **2026-08-25에 한 번 더 확인됐다**: 그날 09:00
  실행에서 FAILED가 8건 났고 아무 데도 알려지지 않았다(결과적으로 데이터는 무사했지만,
  그걸 안 것은 사후에 로그를 직접 뒤졌기 때문이다).
  · 코드는 이미 배선돼 있다(`onFailure` → `notifySlack`, 그리고 윈도우 미완주 시
    `notify-incomplete`). 남은 것은 환경변수 하나다 — Slack Incoming Webhook 발급 →
    Vercel Settings → Environment Variables에 `SLACK_WEBHOOK_URL`을 Production에
    Sensitive로 등록 → **재배포**(`npx vercel redeploy stayhome-khaki.vercel.app`).
    돌고 있는 배포에는 소급되지 않는다.
  · 중간 재시도는 통보 대상이 아니다. 알림이 오는 것은 리조트별 **최종** 실패와
    윈도우 미완주 두 가지뿐이라, 노이즈 때문에 끄게 되는 종류가 아니다.
  · **2026-08-26에 세 번째로 확인됐다** — 그날 09:00 실행에서 한화가 FAILED 5건으로
    끝났고, 그 사실을 안 것은 운영자가 물어봤기 때문이다. 그날의 원인들은 고쳤지만
    **다음 실패를 알아채는 경로는 여전히 사람이다.** 운영자 판단으로 이번 작업
    범위에서 제외했다(2026-08-26).
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
