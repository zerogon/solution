<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Sulki Holiday — 한 사람의 연차 장부

요구사항은 `PRD.md`. 구현 결정 근거는 이 문서가 단일 출처다.

2026-10-19, 다지점 카페 연차 시스템(safetopia)을 **1인용 연차 장부**로 전환했다. 사용자는 한 명이고,
그 전에는 엑셀로 관리했다(연도별 부여 일수 + 쓴 날 한 줄씩 + 잔여). 관리자·직원·지점·감사 로그·입사일 회차
자동 발생·승인/취소 상태는 전부 없앴다. 폴더 `safetopia/`와 브랜치 `safetopia`는 Vercel 설정 때문에 이름을 그대로 둔다.

## 스택 / 형제 앱과의 관계
- Next 16(App Router, Turbopack) + React 19 + Prisma 7(`prisma-client` 생성기, `@prisma/adapter-pg`) + Auth.js v5 beta(Credentials, JWT) + Tailwind v4 + shadcn v4 **base-nova(Base UI, Radix 아님)** + zod 4 + sonner.
- 같은 저장소의 형제 브랜치 `pianoflow`(인증·로컬 DB 가드·앱 셸 원형)와 `stayhome`(PWA·공휴일 파서 원형)에서 골격을 이식했다. 형제 코드는 `git show pianoflow:pianoflow/<path>` 로 본다(디스크에 없음).
- **Base UI 주의**: `asChild` 없음 → `render={<Link/>}`. `Select.onValueChange`는 `(value: string | null)`. 메뉴 항목에 `<button type=submit>`을 넘길 땐 `nativeButton`.

## 디자인
- `src/app/globals.css` OKLCH 토큰. 형제와 구조·L/C 동일, **hue만 웜(브랜드 52 + 중성 65~75)**. 새 색은 이 계열 안에서 — 예외는 의미색뿐이다(destructive 25, 토요일 chart-2 250, 경고 amber 유틸).
- 브랜드 마크는 **원 안의 턱시도 고양이**(2026-10-19, stayhome과 같은 방식) — 원본 `assets/brand/logo.png` 한 장에서 `npm run icons:generate`가 모든 아이콘과 앱 안 마크(`/icons/mark.png`)를 굽는다. 원형 테두리가 그림에 있어 배경을 깔지 않는다(maskable·iOS만 `ICON_BG`). 상수는 `src/lib/brand-mark.ts`, 절차는 `public/icons/README.md`. 아이콘을 다시 구우면 `public/sw.js`의 `CACHE_VERSION`도 올린다(`/icons/*`는 cache-first). 로그인 화면은 마크 + "Sulki Holiday" 텍스트.
- 웜 브라운 팔레트(hue 52)는 카페 시절 로고에서 온 값이다. 고양이 로고는 무채색이라 바꿀 여지가 있다(미결).
- 라이트 고정(`layout.tsx`가 `colorScheme: light`). `.dark` 블록은 **가드로 남긴다** — 지우면 `dark:` 유틸이 OS 다크에서 되살아난다.
- 숫자는 `font-mono tabular-nums`. 페이지는 `<div className="space-y-6"><PageHeader/>…</div>`.
- 한글 라벨에는 `break-keep`. `StatCard`는 모바일에서 아이콘을 접는다(2~4열 그리드에서 글자 자리를 먹는다).
- 날짜 음영은 `isShadedDay`(`src/lib/calendar.ts`) 하나 — 주말+쉬는 요일+공휴일. **표시 전용이라 `leave-days.ts`의 `dayOff`(차감 판정)와 일부러 다르다.** 합치지 말 것.
- 월 그리드 칸 음영은 `SHADED_DAY_CELL`/`OUT_OF_MONTH_CELL`(불투명 — `gap-px bg-border` 위라 반투명이면 격자선보다 어두워진다).
- 월 캘린더는 `MonthGrid`(`src/components/month-grid.tsx`, 서버 컴포넌트). 셀 본문은 `renderDay` 슬롯.
- 셸 지오메트리 `--app-sidebar-w`(16rem) + `--app-content-w`(88rem) = 1664px 고정 쌍. 내비는 `nav-items.ts`의 `NAV_ITEMS` 한 배열(홈·연차 기록·캘린더·설정).

## 날짜 규약 (어기면 하루 밀린다)
- 경계는 `"YYYY-MM-DD"` 문자열. DB는 `@db.Date`. Date 객체는 **UTC 자정**(`parseDate`). 읽을 땐 UTC getter만.
- `new Date(y, m, d)` / 로컬 타임 API 금지. 산술은 `addDaysIso`/`diffDaysIso`(`src/lib/utils.ts`).
- `Owner.closedWeekdays`는 `getUTCDay()` 규약(0=일).

## 데이터 모델 (`prisma/schema.prisma`)
- `Owner` — 싱글턴(id `"owner"`). 이름, bcrypt 비밀번호, 쉬는 요일(기본 `[0,6]` 토·일).
- `LeaveYear` — 연도별 부여(`year` 유니크, `grantedDays`, `carriedOverDays`, `memo`). 기간은 **캘린더 연도**(1/1~12/31).
  이월은 지난해 잔여에서 자동으로 끌어오지 않는다 — 회사마다 규칙이 달라 엑셀처럼 직접 적는다.
- `LeaveEntry` — 기록 1줄(유형·시작/종료·`days`·`manualDays`·`memo`). 상태 없음, 삭제는 하드 삭제.
- `LeaveEntryDay` — 기록이 덮는 날짜 1행. **`date` 유니크**가 같은 날 중복 기록을 DB 층에서 막는다. 캘린더가 이 표를 읽는다.
- 잔여는 저장하지 않는다: 총 = 부여 + 이월, 사용 = 그 해 `LeaveEntry.days` 합(`src/lib/queries.ts`), 잔여 = 총 − 사용
  (`src/lib/leave-balance.ts`). "그 해의 기록" = 시작일이 그 해인 기록 — 한 기록은 한 해 안에 있으므로 정확하다.
- **잔여가 모자라도 기록을 막지 않는다.** 장부는 일어난 일을 적는 곳이고, 지난 해를 옮겨 적을 때 부여보다 기록을 먼저 넣는 일이 흔하다. 음수 잔여는 빨갛게, 폼 미리보기는 amber 경고.

## 일수 계산
- `src/lib/leave-days.ts`(순수, 서버·클라이언트 공유, vitest). 쉬는 요일 + 공휴일을 뺀다. 반차는 하루·0.5일, 쉬는 날이면 거부.
- 공휴일 `src/lib/holidays-server.ts` — Google iCal 피드(실측 2021~올해+1), 12h 메모리 캐시, stale 폴백. `/api/holidays`는 얇은 래퍼.
  데이터 없는 연도는 `uncovered`로 **자동 계산을 멈춘다**(모르는 채로 세면 연차를 더 깎는다).
- 그때(또는 회사 사정으로 일수가 다를 때) **일수 직접 입력**(`manualDays=true`)을 쓴다. 일수는 사용자 값을 믿고, 날짜 행은
  `manualEntryDates`가 아는 만큼만 쉬는 날을 빼서 만든다(다 빠지면 범위 전체). 반차의 직접 입력은 0.5일 고정.
- 모양 규칙(`checkRange`)은 자동·직접 공통: 종료 ≥ 시작, **해를 넘기면 `year_boundary`**, 31일 초과 `too_long`, 반차 이틀 금지.
- 쉬는 요일을 바꿔도 **저장된 기록의 일수는 재계산하지 않는다** — 그 날 실제로 깎인 일수가 장부의 사실이다.
- 쓰기는 전부 `src/lib/leave-service.ts`(`createEntry`/`updateEntry`/`deleteEntry`, 각각 `$transaction`). 서버에서 일수를 다시 계산하고(미리보기를 믿지 않는다),
  수정은 날짜 행을 지우고 다시 만든다(자기 옛 날짜와는 충돌로 보지 않는다). P2002는 `toActionError`가 "이미 기록된 날짜"로 번역.

## 인증
- 사용자 한 명 — **아이디 없이 비밀번호만**. `src/auth.ts` Credentials가 `Owner.password`와 bcrypt 비교. 세션 `user.id`는 항상 `"owner"`.
- `src/auth.config.ts`는 공개 경로(`/login`, `/offline`, `/manifest.json`, `/icons/*`, `/api/auth`) 외에 세션만 본다. 역할 구분 없음.
- `requireOwner()`(`src/lib/auth-helpers.ts`)가 셸 레이아웃 가드 — 세션 + Owner 행(이름·쉬는 요일). 서버 액션은 `isSignedIn()`.
- 비밀번호 변경은 `/settings`. 잊었거나 첫 배포면 `npm run owner:set-password`(아래).

## 로컬 개발
- `npm run db:local:up`(Docker Postgres **5434**, DB `sulki_holiday`/유저 `sulki`; 5433은 pianoflow) → `db:local:dev`(migrate dev) → `db:local:seed`. 파괴적 명령은 전부 `assert-local-db` 가드 뒤.
- 시드: 비밀번호 `1234`, 2025(직접 입력 기록 3건)·2026(어린이날 낀 기간·반차·앞으로의 휴가) 부여와 기록.
- 검증: `npm run typecheck`, `npm run lint`, `npm test`(vitest — 순수 함수만), 수동 절차는 `.claude/skills/verify/SKILL.md`.
- Docker를 못 띄우면 `npx pglite-server -p 5455 -m 10` + `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5455/postgres?sslmode=disable`로 메모리 DB에서 migrate/seed/스모크가 된다(`localhost`는 ::1로 가서 실패 — 127.0.0.1을 쓸 것).

## 배포 (Vercel + Neon)
- `build`는 `prisma generate && next build` — **마이그레이션도 시드도 돌지 않는다**. 스키마를 바꿔 배포할 땐
  Neon을 가리킨 채 `npx prisma migrate deploy`를 수동으로 돌린다(`prisma.config.ts`가 `DIRECT_URL`을 본다).
- 2026-10-19 전환에서 마이그레이션 이력을 `20261019000000_init` 하나로 새로 시작했다. 옛 표가 남은 Neon에는
  `migrate deploy`가 아니라 **`migrate reset`**(옛 데이터 폐기 — 사용자 승인됨)이 필요하다.
- `prisma/seed.ts`는 모든 표를 지우고 다시 만드는 **로컬 전용**이다(`assert-local-db` 가드). 운영에는 절대 쓰지 않는다.
- 배포 후 첫 로그인 수단은 `OWNER_PASSWORD=… OWNER_NAME=… npm run owner:set-password -- --yes`(`scripts/set-password.ts`) — 지우는 것 없이 Owner 한 행만 upsert.
  `scripts/load-env.ts`가 `.env.local`을 `.env`보다 먼저 읽으므로 **대상 DB를 반드시 확인**한다.
- PWA는 dev에서 SW를 등록하지 않는다(개발 청크 cache-first 사고 방지). `next build && next start`로 확인.
  캐시 접두사는 `sulki-holiday-`, 옛 `safetopia-` 캐시도 activate에서 함께 지운다.

## 커밋
- `[feat]_sulki-holiday …` / `[fix]_…` / `[chore]_…`. **`git add safetopia`로 한정** — `-A`는 형제 폴더를 끌어온다.
