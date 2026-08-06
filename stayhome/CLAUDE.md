@AGENTS.md

# Welfare Stay — Agent Notes

## 프로젝트 컨텍스트

사내 복지 담당자 1인용 제휴 리조트 통합 조회 시스템. 5개 리조트(롯데·리솜·한화·오크밸리·소노) 중 MVP는 **롯데리조트 1개만** 구현하고, 나머지는 selector/config 등록만으로 확장 가능한 구조를 유지한다. (대명리조트는 소노로 리브랜딩되어 SONO 하나로 통합, 켄싱턴·현대는 대상에서 제외됨.)

전체 설계: `prd.md`.

## 스택 / 핵심 결정

- Next.js 16 + React 19 + Tailwind v4 + shadcn v4 (`base-nova` 스타일, base-ui 기반)
- Prisma 7 + Neon PostgreSQL (`@prisma/adapter-pg`, pooler + direct URL)
- NextAuth v5 + Google OAuth + DB 이메일 화이트리스트
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
2. 복호화하는 모든 경로는 동일 호출에서 `writeAudit({ action: REVEAL_CREDENTIAL, ... })` 작성 필수.
3. `RESORT_CRED_SECRET`이 32바이트(base64 decode 후)가 아니면 `crypto.ts`가 에러를 던지도록 검증.
4. `/api/cron/*`, `/api/inngest/*` 외 모든 라우트는 `proxy.ts`에서 세션 검증.

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
- **Phase F**: 나머지 4개 리조트(리솜·한화·오크밸리·소노) 확장

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
  지점 수 > 지역 수일 때만 뜬다. 롯데 단독(지점 4 / 지역 4)은 둘 다 숨겨져 지점 칩 한 줄만
  남는다. `REGION_ORDER`는 `place-selection.ts`에 있다 — 카탈로그는 server-only라 클라가 못 읽는다.
- **무효 조합은 상태로 존재할 수 없다.** `selectResort/Region/Property` 세 함수가 상위 축
  변경 시 모순되는 하위를 지우고, 지점 선택 시 상위를 그 지점 값으로 채운다.
  `StayRangeCalendar`가 `{from, to: undefined}`를 안 만드는 것과 같은 판단.
- **서버 필터 축은 `resort` 하나뿐.** 지역·지점은 클라이언트 `matchesPlace`가 좁힌다 —
  칩마다 예약 가능 건수 배지가 왕복 없이 나오고, `stale` 흐림이 날짜/리조트 변경에만 걸린다.
  `matchesPlace`는 카탈로그가 아니라 **행 자신의 `region`/`resortSlug`**로 판정한다.
- **최신화는 항상 단일 지점.** `/api/resorts/[slug]/refresh`는 `maxDuration=60`에
  `runResortCrawl` 50초 예산이라 지점 10곳 넘는 리조트의 "전체 최신화"는
  `withDeadline`이 터져 0행 FAILED가 된다. 여러 리조트 동시 최신화는 호출 1건 =
  브라우저 1세션이라 불가능.
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

- **스케줄 주체는 Inngest 크론이지 Vercel Cron이 아니다.** Vercel Hobby는 크론을
  **하루 1회**로 제한하고, `0 */3 * * *` 같은 표현은 **배포 시 실패**한다
  (vercel.com/docs/cron-jobs/usage-and-pricing). Inngest는 자체 스케줄러로
  `/api/inngest`를 호출하므로 요금제 제약을 받지 않는다.
  `scheduled-refresh`가 `TZ=Asia/Seoul 0 */3 * * *`(하루 8회)로 팬아웃한다.
  `vercel.json`의 하루 1회 `/api/cron/refresh`는 **Inngest 앱 sync가 깨졌을 때를 위한
  백스톱**이지 주 경로가 아니다 — `CRON_SECRET` Bearer 검증 필수.
- **6시간 주기 금지** — `ResortSession` TTL이 정확히 6시간이라 매 실행이 만료 세션에
  걸려 재로그인 비용을 낸다. 3시간은 세션 1회 로그인으로 2회 실행을 덮는다.
- **핫 윈도우 = 30일 × 1~2박** (`src/lib/inngest/windows.ts`, 지점 4개 → 240 API콜/회).
  `/api/inventory`가 `(checkinDate, checkoutDate)` 정확 일치라서 UI가 허용하는
  조합(임의 날짜 × 1~14박)을 전부 사전 수집하는 건 불가능하다. 핫 윈도우 밖은
  `POST /api/resorts/[slug]/refresh`(SearchView "최신화" 버튼)로 실시간 크롤한다.
  윈도우 배열은 **가까운 날짜부터** 정렬 — 예산이 끊기면 앞에서부터 잘리기 때문.
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
    **선(先) 중복 제거** 필수.
  · 날짜는 Date가 아니라 `'YYYY-MM-DD'::date`로 바인딩 — Date는 timestamptz로 전송돼
    세션 TimeZone으로 캐스팅되고, 그게 이 앱의 UTC 자정 규약이 막으려는 하루 밀림이다.
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

## 미해결 사항

- 웹 푸시 **구독** 플로우(VAPID 키 · `web-push` · 구독 저장 테이블) 미구현.
  `sw.js`의 `push`/`notificationclick` 핸들러는 준비돼 있어 서버 쪽만 붙이면 된다.
- 사전 존재 lint 오류 2건(`scripts/lotte-codegen.js`의 `require()`,
  `RevealDialog.tsx:38`의 set-state-in-effect) — 이번 작업 이전부터 있던 것.

(롯데 크롤러는 2026-07-26 실사이트 검증 통과: L.POINT 로그인 → 4개 지점 76행 upsert →
세션 재사용 확인 → `active=true` 적용 완료)
