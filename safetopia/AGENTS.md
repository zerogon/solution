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
- `src/app/globals.css` OKLCH 토큰. 형제와 구조·L/C 동일, **hue만 웜(브랜드 52 로스팅 브라운 + 중성 65~75)**. hue 52는 로고 잉크(`public/icons/icon.png`)를 측정해 얻었다. 새 색은 이 계열 안에서 — 예외는 의미색뿐이다(취소 muted, destructive 25, 토요일 chart-2 250, 경고 amber 유틸).
- 브랜드 로고는 벡터가 아니라 **원본 PNG 한 장에서 잘라 쓴다**. 크롭·색·모서리 상수는 `src/lib/brand-mark.ts` 하나가 출처이고 `components/app-mark.tsx`와 `scripts/generate-icons.ts`가 공유한다. 절차는 `public/icons/README.md`. 아이콘을 다시 구우면 `public/sw.js`의 `CACHE_VERSION`도 올린다(`/icons/*`는 cache-first).
- 라이트 고정(`layout.tsx`가 `colorScheme: light`). `.dark` 블록은 **가드로 남긴다** — 지우면 `dark:` 유틸이 OS 다크에서 되살아난다.
- 숫자는 `font-mono tabular-nums`. 페이지는 `<div className="space-y-6"><PageHeader/>…</div>`.
- 날짜 음영은 `isShadedDay`(`src/lib/calendar.ts`) 하나 — 주말+지점 휴무+공휴일. **표시 전용이라 `leave-days.ts`의 `dayOff`(차감 판정)와 일부러 다르다.** 합치지 말 것.
- 음영 클래스는 색은 같고 **바탕이 달라 둘**이다: 표 셀은 `SHADED_DAY_CLASS`(반투명 — hover·합계 행 틴트가 비쳐야 한다), 월 그리드 칸은 `SHADED_DAY_CELL`/`OUT_OF_MONTH_CELL`(불투명 — `gap-px bg-border` 위라 반투명이면 격자선보다 어두워진다).
- 월 캘린더는 `MonthGrid`(`src/components/month-grid.tsx`, 서버 컴포넌트) 하나를 직원/관리자 캘린더와 관리자 대시보드 모바일이 공유한다. 셀 본문은 `renderDay` 슬롯.
- 셸 지오메트리 `--app-sidebar-w`(16rem) + `--app-content-w`(88rem) = 1664px 고정 쌍.

## 날짜 규약 (어기면 하루 밀린다)
- 경계는 `"YYYY-MM-DD"` 문자열. DB는 `@db.Date`. Date 객체는 **UTC 자정**(`parseDate`). 읽을 땐 UTC getter만.
- `new Date(y, m, d)` / 로컬 타임 API 금지. 산술은 `addDaysIso`/`diffDaysIso`(`src/lib/utils.ts`).
- `Branch.closedWeekdays`는 `getUTCDay()` 규약(0=일).

## 도메인 핵심
- 일수 계산 `src/lib/leave-days.ts`(순수, 서버·클라이언트 공유, vitest). **주말 자동 제외 없음** — 지점 휴무 요일 + 공휴일만 뺀다. 공휴일 데이터 없는 연도는 `uncovered`로 신청 차단(적게 세면 직원 손해 방향이라 fail-closed).
- 공휴일 `src/lib/holidays-server.ts` — Google iCal 피드, 12h 메모리 캐시, stale 폴백. `/api/holidays`는 얇은 래퍼.
- **승인 절차 없음**(2026-09-05 제거). 신청 = 확정(`CONFIRMED`). `LeaveStatus`는 `CONFIRMED | CANCELLED` 둘뿐.
- 상태 전이는 전부 `src/lib/leave-service.ts`, 전부 `$transaction`. 신청 트랜잭션이 `usedDays`를 더하고, 취소가 되돌린다. balance 행 잠금(`lockPeriodBalance`)이 같은 직원 동시 신청을 직렬화하고, `leave_request_days(user_id, date)` 유니크가 최후 방어선. `npm run race-test`로 검증(기대: 성공 1 / 차단 9).
- 취소 두 경로: 직원 본인은 **시작일이 오늘(KST) 이후**인 건만(`cancelOwnRequest`), 관리자는 언제든 사유 선택(`adminCancelRequest`, 감사 로그). 둘 다 `cancelledBy/At`, 관리자 사유는 `cancelReason`.
- `LeaveRequestDay`는 CONFIRMED 동안만 존재. 취소 시 **삭제**(그래야 그 날 재신청 가능). 부모 `LeaveRequest`는 이력으로 남는다. 캘린더·오늘 휴가자는 이 표를 상태 조건 없이 읽는다.
- 직원 `/calendar`는 같은 지점(`user.branchId`) 동료의 `LeaveRequestDay`까지 읽는다(연한 칩, `DayLeaveList` 재사용). **다른 지점은 비공개** — 지점 필터를 빼면 전 지점 연차가 노출된다. 소속 지점이 없으면 본인만.
- 잔여 산식 `src/lib/leave-balance.ts`: total = 부여+이월+조정, remaining = total - used. 대기/신청 가능 개념 없음.

## 연차 회차 — 잔액의 단위는 캘린더 연도가 아니다 (2026-09-10)
- **입사일 기준 회차**(`src/lib/leave-accrual.ts`, 순수·vitest). n회차 = `[addMonthsIso(hire, 12*(n-1)), 다음 시작-1일]`.
  회차는 **항상 입사일을 앵커로** 계산한다 — 이전 회차에서 체이닝하면 말일 클램프가 누적돼 밀린다(1/31 → 2/28 → 3/28).
- 발생: 1회차는 입사 후 1·2·…·11개월마다 1일(최대 11, 회차 끝나면 소멸·자동 이월 없음). 2회차 이상은
  `min(25, 15 + floor((y-1)/2))`, y = index-1. 법정 요건인 "개근·80% 출근"은 출근을 관리하지 않으므로 충족 가정.
- `LeaveBalance`의 유니크 키는 `(userId, periodIndex)`다. **`year`는 없앴다** — 입사일에서 파생되는 값이라
  입사일을 고치면 키가 통째로 이동한다(2025행이 2026행과 충돌). `periodIndex`는 입사일이 바뀌어도 불변인 신원이다.
  `periodStart/End`는 파생값이라 입사일 수정 시 `realignBalances`가 다시 계산한다. 음수 index는 전환 이전의
  캘린더 연도 행(`-2026` = 옛 2026년)이고 회차 계산에서 제외된다.
- `totalDays`는 **nullable이고 null이 "자동 계산"을 뜻한다.** 자동값을 저장하면 1년 미만 회차는 매달 커지므로
  반드시 낡는다. 읽기·쓰기 모두 `withGranted(row, autoDays)`를 통과한다(`BalanceLike.totalDays`가 `number`인 것이 그 강제 장치).
- 잔액 행은 미리 만들지 않는다. `lockPeriodBalance`(`src/lib/leave-period.ts`)가
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`으로 **없으면 만들고 있으면 잠근다**(DO NOTHING은 락을 잡지도
  돌려주지도 않는다). 덕분에 해가 바뀌어도, 1년 넘은 직원을 뒤늦게 등록해도 "미부여"로 막히지 않는다.
  읽기 경로(`src/lib/queries.ts`)는 행이 없으면 자동 계산으로 **합성**해 보여 준다 — 쓰기 없이.
- `LeaveRequest.leaveBalanceId`가 그 신청이 깎은 행을 가리킨다. 취소는 **이 id로만** 되돌린다 —
  시작일에서 회차를 재유도하면 그 사이 입사일이 수정된 경우 다른 행을 깎아 usedDays가 영구히 어긋난다.
- `computeLeaveDays`의 경계 규칙은 `period_boundary`다(옛 `year_boundary` 폐기). 회차는 연도가 아니라서
  12/28~1/3처럼 해를 넘겨도 같은 회차면 통과한다. **`periodFor`(회계)와 `computeLeaveDays`(차감)는 다른 축이다 —
  `isShadedDay`/`dayOff`처럼 합치지 말 것.**

## 인증
- `src/auth.config.ts` `ROLE_PREFIX`: `/admin`만 ADMIN. 나머지는 세션만 있으면 접근(관리자도 직원 화면 사용 가능).
- `requireActiveUser()`(`src/lib/auth-helpers.ts`)가 역할 레이아웃 공통 가드 — 세션 뒤 **DB 1회 조회**로 비활성 즉시 차단 + `mustChangePassword` → `/account/password` 강제. 그 페이지는 셸 밖(가드 쓰면 루프).
- 서버 액션은 `requireAdmin()` 또는 `auth()` + 소유권 `where`. 결과는 `ActionResult`, 오류는 `toActionError()`.

## 로컬 개발
- `npm run db:local:up`(Docker Postgres **5434**, 5433은 pianoflow) → `db:local:dev`(migrate dev) → `db:local:seed`. 파괴적 명령은 전부 `assert-local-db` 가드 뒤.
- 시드 계정: `admin/admin1234`, `emp01~08/1234`(emp03~은 첫 로그인 비번 변경 강제), `retired01`(차단).
  시드는 부여 일수를 넣지 않는다 — 입사일만 주고 자동 발생이 맞는지 본다. 입사일은 까다로운 자리로 골랐다
  (말일·2/29·1주년 직전·상한 근처).
- 검증: `npm run typecheck`, `npm run lint`, `npm test`(vitest — 순수 함수만), `npm run race-test`, 수동 절차는 `.claude/skills/verify/SKILL.md`.
  `race-test`는 2단계다 — 1단계는 같은 날짜 동시 신청(기대: 성공 1 / 차단 9 / 잔액 행 1),
  2단계는 잔액 행이 없는 회차에 `lockPeriodBalance` 동시 10건(기대: 실패 0 / 잔액 행 1).

## 배포 (Vercel + Neon)
- `build`는 `prisma generate && next build` — **마이그레이션도 시드도 돌지 않는다**. 스키마를 바꿔 배포할 땐
  Neon을 가리킨 채 `npx prisma migrate deploy`를 수동으로 돌린다(`prisma.config.ts`가 `DIRECT_URL`을 본다).
- `prisma/seed.ts`는 모든 표를 지우고 다시 만드는 **로컬 전용**이다(`assert-local-db` 가드). 운영에는 절대 쓰지 않는다.
- 배포 후 첫 로그인 수단은 `npm run admin:create`(`scripts/create-admin.ts`) — 지우는 것 없이 관리자 하나만 upsert.
  `scripts/load-env.ts`가 `.env.local`을 `.env`보다 먼저 읽으므로 **대상 DB를 반드시 확인**하고 `--yes`를 붙인다.
- PWA는 dev에서 SW를 등록하지 않는다(개발 청크 cache-first 사고 방지). `next build && next start`로 확인.

## 커밋
- `[feat]_safetopia …` / `[fix]_…` / `[chore]_…`. **`git add safetopia`로 한정** — `-A`는 형제 폴더를 끌어온다.
