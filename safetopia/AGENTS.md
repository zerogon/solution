<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# safetopia — 다지점 카페 연차 관리

요구사항은 `PRD.md`. 구현 계획·결정 근거는 이 문서가 단일 출처다.

## 스택 / 형제 앱과의 관계
- Next 16(App Router, Turbopack) + React 19 + Prisma 7(`prisma-client` 생성기, `@prisma/adapter-pg`) + Auth.js v5 beta(Credentials, JWT) + Tailwind v4 + shadcn v4 **base-nova(Base UI, Radix 아님)** + zod 4 + sonner.
- 같은 저장소의 형제 브랜치 `pianoflow`(인증·로컬 DB 가드·앱 셸 원형)와 `stayhome`(PWA·공휴일 파서 원형)에서 골격을 이식했다. 형제 코드는 `git show pianoflow:pianoflow/<path>` 로 본다(디스크에 없음).
- **Base UI 주의**: `asChild` 없음 → `render={<Link/>}`. `Select.onValueChange`는 `(value: string | null)`. 메뉴 항목에 `<button type=submit>`을 넘길 땐 `nativeButton`.

## 디자인
- `src/app/globals.css` OKLCH 토큰. 형제와 구조·L/C 동일, **hue만 150(세이지 그린)**. 새 색은 150 계열 안에서; 상태색(대기 amber/반려 destructive)만 예외.
- 라이트 고정(`layout.tsx`가 `colorScheme: light`). `.dark` 블록은 **가드로 남긴다** — 지우면 `dark:` 유틸이 OS 다크에서 되살아난다.
- 숫자는 `font-mono tabular-nums`. 페이지는 `<div className="space-y-6"><PageHeader/>…</div>`.
- 셸 지오메트리 `--app-sidebar-w`(16rem) + `--app-content-w`(88rem) = 1664px 고정 쌍.

## 날짜 규약 (어기면 하루 밀린다)
- 경계는 `"YYYY-MM-DD"` 문자열. DB는 `@db.Date`. Date 객체는 **UTC 자정**(`parseDate`). 읽을 땐 UTC getter만.
- `new Date(y, m, d)` / 로컬 타임 API 금지. 산술은 `addDaysIso`/`diffDaysIso`(`src/lib/utils.ts`).
- `Branch.closedWeekdays`는 `getUTCDay()` 규약(0=일).

## 도메인 핵심
- 일수 계산 `src/lib/leave-days.ts`(순수, 서버·클라이언트 공유, vitest). **주말 자동 제외 없음** — 지점 휴무 요일 + 공휴일만 뺀다. 공휴일 데이터 없는 연도는 `uncovered`로 신청 차단(적게 세면 직원 손해 방향이라 fail-closed).
- 공휴일 `src/lib/holidays-server.ts` — Google iCal 피드, 12h 메모리 캐시, stale 폴백. `/api/holidays`는 얇은 래퍼.
- 상태 전이는 전부 `src/lib/leave-service.ts`, 전부 `$transaction`. balance 행 `FOR UPDATE`로 같은 직원 동시 신청을 직렬화하고, `leave_request_days(user_id, date)` 유니크가 최후 방어선. `npm run race-test`로 검증(기대: 성공 1 / 차단 9).
- `LeaveRequestDay`는 PENDING/APPROVED 동안만 존재. 반려/취소 시 **삭제**(그래야 그 날 재신청 가능). 부모 `LeaveRequest`는 이력으로 남는다.
- 잔여 산식 `src/lib/leave-balance.ts`: total = 부여+이월+조정, remaining = total - used, available = remaining - pending(집계). `usedDays`만 컬럼, `pendingDays`는 SUM.

## 인증
- `src/auth.config.ts` `ROLE_PREFIX`: `/admin`만 ADMIN. 나머지는 세션만 있으면 접근(관리자도 직원 화면 사용 가능).
- `requireActiveUser()`(`src/lib/auth-helpers.ts`)가 역할 레이아웃 공통 가드 — 세션 뒤 **DB 1회 조회**로 비활성 즉시 차단 + `mustChangePassword` → `/account/password` 강제. 그 페이지는 셸 밖(가드 쓰면 루프).
- 서버 액션은 `requireAdmin()` 또는 `auth()` + 소유권 `where`. 결과는 `ActionResult`, 오류는 `toActionError()`.

## 로컬 개발
- `npm run db:local:up`(Docker Postgres **5434**, 5433은 pianoflow) → `db:local:dev`(migrate dev) → `db:local:seed`. 파괴적 명령은 전부 `assert-local-db` 가드 뒤.
- 시드 계정: `admin/admin1234`, `emp01~08/1234`(emp03~은 첫 로그인 비번 변경 강제), `retired01`(차단).
- 검증: `npm run typecheck`, `npm run lint`, `npm test`(vitest — 순수 함수만), `npm run race-test`, 수동 절차는 `.claude/skills/verify/SKILL.md`.
- PWA는 dev에서 SW를 등록하지 않는다(개발 청크 cache-first 사고 방지). `next build && next start`로 확인.

## 커밋
- `[feat]_safetopia …` / `[fix]_…` / `[chore]_…`. **`git add safetopia`로 한정** — `-A`는 형제 폴더를 끌어온다.
