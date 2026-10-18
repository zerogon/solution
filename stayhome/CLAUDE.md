@AGENTS.md

# Welfare Stay — Agent Notes

## 프로젝트 컨텍스트

사내 복지 담당자 1인용 제휴 리조트 통합 조회 시스템. 대상은 5개 리조트(롯데·리솜·한화·오크밸리·소노)이고
**5곳 전부 운영 중**이다(2026-08-13, 지점 합계 57곳). MVP는 롯데 1개로 시작했고,
나머지는 크롤러 모듈 + 배선 2~3줄로 붙는 구조를 유지한다 — Inngest 함수·조회 UI·`/api/inventory`는
리조트를 네 번 늘리는 동안 한 줄도 바뀌지 않았다. `run.ts`·`types.ts`는 **한화에서 처음
바뀌었는데**, 배선이 아니라 새 능력이 필요해서다(로그인이 세 번째 비밀값을 요구한다 —
아래 "보안 규칙" 5번).
(대명리조트는 소노로 리브랜딩되어 SONO 하나로 통합, 현대는 대상에서 제외됨.
**켄싱턴은 6번째로 붙는 중이다**(2026-10-18) — 크롤러·카탈로그·배선은 끝났고 로컬 크롤 통과,
`Resort.active=false`인 채로 배포를 기다린다. **배포 전에 켜지 말 것**: 구 배포의 Prisma 클라이언트는
`KENSINGTON` enum 값을 모른다. 로그인은 무기명(법인) 회원, 수집은 분양회원 경로 — `docs/crawlers/kensington.md`.)

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
  · **앞의 것과 `--app-content-w`는 한 쌍이다** — 합이 1664px로 고정돼야 1920px에서
    사이드바-본문 관계가 유지된다. 2026-09-01에 마감일 계산기 달력이 사이드바 안으로
    들어오면서 16→**18rem**이 됐고, 그만큼 content-w를 88→**86rem**으로 줄였다.
    한쪽만 고치면 본문이 밀려 72rem 시절의 증상이 그대로 돌아온다.
- 인증 화면은 `src/app/(app)/` 라우트 그룹 안에 둔다(URL 불변). `/login`·`/offline`은 셸 밖.
- 숫자(날짜·건수·소요시간)는 `font-mono tabular-nums`.
- **라이트 고정** — `<html style={{colorScheme:"light"}}>`. `.dark` 토큰은 준비만 돼 있고 켜지 않는다.
- 잔여 객실 상태색(`src/lib/availability-tone.ts`)만 테마 토큰이 아닌 Tailwind 리터럴 팔레트를
  쓴다. 브랜드가 아니라 의미색이고, primary 틸을 "예약 가능"에 쓰면 둘이 구분되지 않기 때문.
  JIT 때문에 클래스는 반드시 정적 리터럴.
- 브랜드 로고의 원본은 `assets/brand/logo.png` 한 장(2026-09-27 고양이 로고, 그전엔
  `brand-mark.ts`의 SVG 지붕+물결) — 앱 안 로고(`app-mark.tsx` → `logo-256.png`)·PWA 아이콘·
  `favicon.ico`가 전부 거기서 구워진다. 바꾸면 `npm run icons:generate` 재실행 +
  `sw.js`의 `CACHE_VERSION` 올리기 필수(`/icons/*`가 cache-first라 파일명이 같으면 안 바뀐다).

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

## 상세 문서 — 자동 로드되지 않는다

이 파일은 2026-10-01에 정리됐다. 설계 근거·실측·사건 기록은 **내용 그대로** 아래로 옮겼고,
여기에는 지금 유효한 규칙만 남겼다. 다른 문서·코드 주석이 "`CLAUDE.md`의 ○○ 절"이라
부르는 곳은 아래 파일이다. **해당 영역을 고치기 전에 그 파일을 먼저 읽을 것** — 아래 요약은
"무엇을 하면 안 되는가"까지이고 "왜"는 거기 있다.

| 영역 | 파일 |
| --- | --- |
| 페이즈 진행 메모(Phase A~F · 크론 안정화 1~3차 · 사건 기록) | `docs/notes/history.md` |
| 조회 필터 | `docs/notes/search-filter.md` |
| 지점 제외 | `docs/notes/branch-exclusion.md` |
| 스케줄링(Inngest · 백스톱 · upsert · 유령 행 · 동시성 · 예산) | `docs/notes/scheduling.md` |
| 배포(Vercel · `/tmp` · Inngest sync) | `docs/notes/deploy.md` |
| 금액(요금) 수집 — 결정 1~5 | `docs/notes/pricing.md` |
| 인원(기준·최대) 수집 | `docs/notes/occupancy.md` |
| 수동 요금 입력 | `docs/notes/manual-rates.md` |
| 소노 변형 수집 | `docs/notes/sono-variants.md` |
| 마감일 계산기 | `docs/notes/deadline-calculator.md` |
| 리조트별 크롤러 | `docs/crawlers/{lotte,sono,resom,oakvalley,hanwha,kensington}.md` |

새 기록도 같은 규칙으로 적는다 — 근거·실측·날짜별 경과는 `docs/` 쪽에, 여기에는 규칙 한두 줄만.
(이 파일과 `AGENTS.md`의 합이 150k자를 넘으면 경고가 뜬다.)

## 현재 상태 한눈에

- 리조트 5곳 · 57지점 운영(롯데 4 · 소노 32 · 리솜 3 · 오크밸리 2 · 한화 16). 켄싱턴 10지점은 활성화 대기.
- 정기 수집: **매일 09:00 KST 1회**(Inngest 크론 `scheduled-refresh`) + 12:00 KST Vercel Cron 백스톱.
- 함수 리전 `icn1`(서울), Vercel Hobby(`maxDuration` 60초, 런타임 로그 미보관 → 증거는 `crawl_logs`).
- `stayhome` 브랜치 push = 프로덕션 배포(Git 연동).
- `sw.js` `CACHE_VERSION` **v6**. 스키마는 `npm run db:push`(`prisma/migrations/` 없음).

## 조회 필터 · 지점 제외

- **크롤러 config는 클라이언트 번들에 흘러가면 안 된다.** 지점 메타의 단일 출처는
  `src/lib/resort-catalog.ts`(server-only)이고 서버 컴포넌트가 props로 내려보낸다.
  회귀 검사: `npm run build && grep -r "bizCd\|roomListApiUrl\|loginPw" .next/static` → 0건.
- 지점 메타는 DB 테이블이 아니라 카탈로그 모듈이다(사본이 어긋나면 "필터를 눌렀는데 0건").
  DB에 있는 것은 **빼는 규칙**뿐이다 — `ResortBranchExclusion`(행이 있으면 제외), 수동 요금.
  둘 다 이름이 어긋나면 에러가 아니라 **무동작**이다.
- 축은 점진 노출(`visibleAxes`). `REGION_ORDER`는 `place-selection.ts`(카탈로그는 클라가 못 읽는다).
  서버 필터 축은 `resort` 하나, 지역·지점은 클라이언트 `matchesPlace`가 행 자신의 값으로 좁힌다.
- **최신화는 항상 단일 지점**(`/api/resorts/[slug]/refresh`, 50초 예산). 지점 루프는 throw가 아니라
  break로 부분 반환해야 한다 — `withDeadline`이 터지면 모은 행 전부가 버려진다.
- "예약 가능만 보기"는 표시 필터이고 판정은 `availability-tone.ts`의 `isBookable` 한 곳.
- 지점 후보 16곳 초과면 바텀시트(`PropertyPicker`). 칩 그리드 컬럼 수는 개수 비의존.
- 지점 제외의 적용점은 `_shared/branches.ts`의 `selectBranches` 하나(크롤러가 `config.branches`를
  직접 돌지 않는다). 삭제는 서버 액션 즉시 + `scheduled-refresh`의 `purge-excluded-inventory`(평상시 0).
  리조트의 마지막 지점은 뺄 수 없다(끄는 스위치는 `Resort.active`). `/api/inventory`에는 필터를
  걸지 않는다. `reason`은 평문.

## 스케줄링 · 크롤 실행

- 정기 수집을 멈출 때는 `pause.ts`의 `SCHEDULED_CRAWL_PAUSED`와 `…_PAUSE_REASON`을 **같이** 고친다.
  **크론 트리거는 지우지 않는다**(일부러 끈 것과 sync가 깨진 것이 구별되지 않는다).
- 스케줄 주체는 Inngest 크론이다(Vercel Hobby 크론은 하루 1회 제한). `/api/cron/refresh`는 백스톱 —
  `CRON_SECRET` 검증, 신선도는 `crawl_logs`가 아니라 **`resort_inventory.synced_at`**(6시간)으로
  판정, 커버리지는 판정에 쓰지 않는다. `?dryRun=1`은 판단만 한다.
- 핫 윈도우 = 30일 × 1~2박 = 60개(`src/lib/inngest/windows.ts`, 가까운 날짜부터).
  **리조트별 윈도우 상수를 스케줄러에 두지 않는다** — 응답 폭은 크롤러가 `InventoryRow.stay`로 신고한다.
- 60초 우회는 패스 단위: `runResortCrawl`이 브라우저 한 세션으로 `windowsCompleted`만큼 돌고,
  `crawl-resort`가 남은 것을 다음 `step.run`에 넘긴다. 진전 0 패스는 1회까지 정상, 연속 2회면 중단.
  `runResortCrawl`은 실패를 `status: FAILED`로 **반환**하므로 `crawl-resort`가 직접 throw한다.
- **upsert는 다중행 `ON CONFLICT` 한 문장**(`$executeRaw`). 선(先) 중복 제거 필수(키에 날짜 포함),
  행당 바인드 17개 · `UPSERT_CHUNK_ROWS` 1,000, 날짜는 `'YYYY-MM-DD'::date`로 바인딩.
  **`COALESCE`로 옛 값을 보존하지 않는다** — 요금·변형·정원 전부 "값의 나이 = `synced_at`"이다.
- `removeVanishedRows`: 1행 이상 답을 받은 `(지점, 체크인, 체크아웃)` 그룹에서만 사라진 행을 **삭제**한다.
  **0행 그룹은 절대 건드리지 않는다**(크롤 실패가 매진으로 발행된다). 그래도 남는 유령은
  `purge-ghost-inventory`가 7일로 지운다(화면의 `AGING_MAX_MS` 3일보다 위여야 한다).
- 지점 호출은 `_shared/pool.ts`의 `mapPool`로 병렬(롯데 4 · 한화 4씩). **켄싱턴만 순차** — 서버가 세션당
  요청을 하나씩 처리해 병렬이 빨라지지 않고 가짜 307만 낸다(실측, `kensington/search.ts`). 그래서 패스당 ~6윈도우. 예산 게이트는 배치 사이,
  콜 타임아웃은 상수가 아니라 **남은 예산(`ctx.deadlineAt`)에서 유도**한다. 한화 `truncated`의
  `stay` 좁히기는 건드리지 않는다.
- `crawl-resort` 동시성은 리조트별 1 + **전역 1**. Inngest `concurrency` 배열은 최대 2칸이다.
- 패스 예산은 쓰기 몫(`upsertEstimateMs`)을 검색 예산에서 먼저 뗀다. `ctx.deadlineAt`은 패스의 끝이
  아니라 **그 검색이 잘리는 시각**이다. 60초를 넘으면 하드 킬이고 `finally`도 돌지 않는다.
- 세션을 잃으면 `SessionLostError`(`_shared/errors.ts`)를 던진다 → `run.ts`가 패스 안에서 1회 회복.
  세션을 버릴지는 stage가 아니라 **원인**이 정한다.
- Inngest 경계를 넘는 날짜는 항상 `"YYYY-MM-DD"` 문자열. `freshness.ts`의 26시간 임계는 크론 주기와 한 쌍.
- 실패 알림은 `onFailure` → `notifySlack`(`SLACK_WEBHOOK_URL` 없으면 무동작 — 아래 미해결).

## 배포 (Vercel)

- 리전은 `vercel.json`의 `icn1`이다. 해외 IP에서는 롯데(Imperva)·한화(연결 거부)가 로그인하지 못한다.
  Hobby는 리전 1개만 가능. Neon은 `us-east-1`이라 쿼리당 ~200ms.
- **`/tmp`(525MB)가 이 프로젝트에서 가장 먼저 바닥나는 자원이다.** 관리는 전부 `_shared/browser.ts` —
  팩 잔해 삭제, 프로필 스윕(`/proc/*/cmdline`은 NUL**과 공백 둘 다**로 자른다), 포기·고아 브라우저 회수,
  코어 덤프 삭제(나이 기준 없음), `TMP_FLOOR_MB` 미만이면 `TmpExhaustedError`(재시도 대상 아님).
  자원 부족으로 인한 launch 실패는 재시도하지 않는다. 증거는 `crawl_logs`의 `[res] …` 칸.
  증상이 사이트 탓처럼 보인다 — `ERR_INSUFFICIENT_RESOURCES`, `browser has been closed`, `spawn ETXTBSY`.
- Playwright를 쓰는 라우트(`/api/inngest`, `/api/resorts/[slug]/refresh`)는 `outputFileTracingIncludes`로
  `browsers.json`을 넣어야 한다. 빠지면 모듈 로드 500이고 `next dev`에서는 멀쩡하다.
  검증: `grep browsers.json .next/server/app/api/inngest/route.js.nft.json`.
- 환경변수는 Sensitive라 되읽을 수 없고, 바꾸면 재배포해야 한다(`npx vercel redeploy stayhome-khaki.vercel.app`).
- `CHROMIUM_PACK_URL`의 팩 메이저는 `playwright-core/browsers.json`의 `browserVersion`과 맞춘다
  (playwright를 올릴 때 `@sparticuz/chromium-min`과 함께).
- Inngest 앱 sync 판정: `curl -X PUT https://stayhome-khaki.vercel.app/api/inngest` →
  `Successfully registered`. Deployment Protection은 Protection Bypass 시크릿으로 통과시킨다.

## 요금 · 인원 · 변형

- `InventoryRow.price`는 **숙박 전체 총액**이다. 종류는 `price_kind`(text)이고 어휘의 단일 출처는
  `src/lib/price.ts` — `PriceKind` · `PRICE_KIND_LABEL` · `isPriceKind` **셋을 같이** 늘린다
  (어긋나면 `/api/inventory`가 그 요금을 조용히 null로 떨어뜨린다).

  | 리조트 | 종류 | 출처 | 경로 |
  | --- | --- | --- | --- |
  | 롯데 | `member`(세션 없으면 `public`) | `roomList`의 `roomAvgAmt` **× 박수**, `memberNo`+`ownType` | 정기 |
  | 리솜 | `member` | `stockPrice`(행마다 1콜) | 최신화만 |
  | 소노 | `member` — **행이 아니라 `variants[]`에** | `room/detail/price`(변형마다 1콜) | 최신화만 |
  | 오크밸리 | `memberTable`(기명) | 공개 `api/v1/village` 요금표, 밸리 31·46평 제외 | 정기 |
  | 한화 | `memberTable`(기명) | 공개 `getRoomPrice.do`, 할인 걸린 밤은 빈칸 | 정기 |
  | 켄싱턴 | — (미부착) | 목록가는 1박 "~최저가"라 총액이 아니다 — 수동 요금으로 | — |

- `withPrices && branches.length === 1` 게이트는 **비용** 게이트다(리솜·소노). 비용 0인 곳은 타지 않는다.
- 예약할 수 없는 방에는 요금을 붙이지 않는다. 화면은 `showsPrice(tone)`로 한 번 더 거른다.
  요금 종류 라벨은 섹션 헤더(`BranchResultSection`)에 그린다. **라벨을 지우지 않는다.**
- **필드가 있다고 값이 있는 게 아니다**(리솜 `rmAmt` 전부 `"0"`, 소노 `personCnt` 전부 null).
  모르는 값은 지어내지 않고 빈칸으로 둔다.
- 인원: `stdCapacity`/`maxCapacity`, 계약은 `InventoryRow.occupancy { standard, max }` — **둘 다이거나
  둘 다 아니다.** 롯데·리솜·오크밸리 부착, 한화(기준만 있음)·소노(없음) 미부착. 가용성·신선도
  게이트가 없다(요금과의 의도된 비대칭). 가드는 `_shared/occupancy.ts` 한 곳.
- 수동 요금: `resort_room_rates`의 (지점, 객실유형)당 **1박 단가**. 자동 요금이 우선
  (`row.price == null`인 행에만). 병합은 클라이언트(`search/manual-rates.ts`, `GET /api/room-rates`) —
  `/api/inventory`와 `sw.js`는 무관하다. `enabled: committed != null` 게이트를 지우지 말 것.
  `showsPrice`를 타지 않는 대신 자기 나이를 표기하고, 행마다 `수동` 라벨을 단다(`showsRowPrice`).
  `price_kind = 'manual'`은 DB에 **절대 저장되지 않는다.** `note`는 평문.
- 소노 변형: `ResortInventory.variants`(jsonb, 소노만), 계약은 `src/lib/variants.ts`. 행은 그대로이고
  행의 `available`/`closingSoon`은 변형에서 유도된다. 이름은 `sono/names.ts`가 `room/detail`
  (본문에 `actualMemNo`)에서 받는다. 소노 행의 `price`는 영원히 null이고 행 줄의 요금은 화면이
  `variantPriceSummary`로 유도한다. 변형 객체 모양을 바꾸면 `CACHE_VERSION`을 올린다.

## 마감일 계산기

데스크톱 사이드바 하단 위젯(`DeadlineCalculator` + 지연 로드 `DeadlineCalculatorBody`).

- **규칙**: 기준일 − 10 달력일(`LEAD_DAYS`) → 그 날이 주말/공휴일이면 직전 영업일. **기준일은 보정하지
  않는다.** 골든 케이스 `2026-10-05 → 2026-09-23`. 계산은 `src/lib/business-days.ts`.
- 공휴일은 `/api/holidays`(Google 공개 캘린더 iCal 프록시, 키 불필요), 파싱은 `src/lib/holidays-ical.ts`.
  `DESCRIPTION`이 `공휴일`과 **완전 일치**하는 것만 취하고, 연 `MIN_HOLIDAYS_PER_YEAR`(10) 미만인 해는
  판정 불가다. 미래 상한은 올해 + 1.
- **"모른다"를 "휴일 아님"으로 읽지 않는다**(`HolidayOracle`의 `covers`). 판정할 수 없으면 날짜 대신 "계산 불가".
- `enabled: picked !== null` 게이트와 `DESKTOP_MQ`(768px, `<aside>`의 `md:`와 한 쌍)를 지우지 말 것 —
  없으면 모바일·모든 페이지 로드에 요청이 조용히 붙는다. 달력 본문은 `next/dynamic`으로 분리돼 있다.
- 회귀 테스트는 `npx tsx scripts/debug-holidays.ts golden`(오프라인 20건).

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
  · 조치는 코드가 아니라 **출구 IP**다 — 함수 리전을 `icn1`(서울)로 옮겼다(`docs/notes/deploy.md`).
    이게 통하지 않으면 남는 해석은 "국가가 아니라 AWS 대역 또는 헤드리스 지문"이고, 그때는
    프록시도 같은 이유로 막힐 공산이 크다. 다음 선택지는 Neon 싱가포르 이전이거나
    Pro 업그레이드 후 크롤러 함수만 리전 분리다.
  · 이 조사 중에 **별개의 원인이 하나 더 드러났고 고쳤다** — `/tmp` 고갈. `docs/notes/deploy.md`.
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
