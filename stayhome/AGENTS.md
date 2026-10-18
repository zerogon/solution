<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 크롤러별 상세는 `docs/crawlers/`에 있다

리조트별 절(사이트 구조 · 로그인 · 요금/인원/변형 조사 · 실측 · `debug-*.ts` 스텝)은
지침 파일 한도(150k자) 때문에 2026-10-01에 이 파일에서 **내용 그대로** 옮겼다.
`CLAUDE.md`와 코드 주석이 "`AGENTS.md`의 ○○ 크롤러 절" · "`AGENTS.md` 소노의 '### …'"
라고 부르는 곳은 전부 아래 파일이다. **자동 로드되지 않는다 — 그 크롤러를 고치거나
조사하기 전에 해당 파일을 먼저 읽을 것.**

| 리조트 | 파일 | 한 줄 요약 |
| --- | --- | --- |
| 롯데 | `docs/crawlers/lotte.md` | 로그인만 브라우저(L.POINT 탭, 넷퍼넬·Imperva 뒤) · `roomList` JSON 직접 호출 · 회원가는 `memberNo`+`ownType` · 지점 4곳 병렬 |
| 소노 | `docs/crawlers/sono.md` | 응답이 그 달 전체 달력(`stay`) · `storeCdList` 배치 · 변형(`variants`)과 `room/detail` 이름 · 요금은 `detail/price`(최신화 전용) |
| 리솜 | `docs/crawlers/resom.md` | 베어러 토큰을 우리 쿠키로 운반 · `calendarRooms` 임의 범위 · 요금은 `stockPrice`(최신화 전용) |
| 오크밸리 | `docs/crawlers/oakvalley.md` | 호스트 둘 · `ptSignature` · id≠name · 월 달력 병합 · 공표 요금표(`rates.ts`) · 정원(`api/v1/room`) |
| 켄싱턴 | `docs/crawlers/kensington.md` | 무기명(법인) 로그인 · **분양회원 경로**(`quick_roomdata_member`, 회원번호는 페이지에서 읽음) · HTML 조각 · 매진은 목록에서 빠짐 · 지점 **순차**(세션 잠금) · 요금 미부착 |
| 한화 | `docs/crawlers/hanwha.md` | 호스트 둘 · 2화면 로그인(회원권 비밀번호 = `memo`) · `doExecute.mvc` 게이트웨이 · 지점 4씩 병렬 · 부분 윈도우는 `stay`를 좁힌다 · 요금표 `getRoomPrice.do` |

새 내용을 적을 때도 리조트별 상세는 그 파일에, 여러 크롤러에 걸친 규칙만 여기에 적는다
(이 파일과 `CLAUDE.md`의 합이 150k자를 넘으면 경고가 뜬다).

# 로컬 검증 · 운영 도구 (롯데 기준 + 공용)

```bash
npx playwright install chromium    # 최초 1회
# /admin/accounts에 L.POINT 자격증명(실계정) 등록 후:
npx tsx scripts/run-crawl.ts       # 수동 크롤 (RefreshButton과 동일 경로)
npx tsx scripts/check-logs.ts      # crawl_logs / inventory / sessions 확인
npx tsx scripts/debug-page.ts roomlist   # 로그인 없이 검색+파싱 파이프라인만 테스트
npx tsx scripts/debug-page.ts doLogin    # 실로그인 + 네트워크 녹화 (성공한 로그인의 기준선)
npx tsx scripts/debug-page.ts keys       # 응답 키 전수 조사 (금액 조사, 로그인 불필요)
npx tsx scripts/debug-page.ts member     # 회원가 조사 — 신원이 응답을 바꾸는가 (doLogin 먼저)
npx tsx scripts/drop-session.ts LOTTE    # 캐시 세션 삭제 → 다음 크롤이 반드시 로그인
npx tsx scripts/login-check.ts           # 5곳 로그인만 순차 점검 (아래)
```

`login-check.ts`는 리조트별 `debug-*.ts doLogin`과 다른 질문에 답한다. 그 스텝들은 충실도가
제각각이라(롯데·한화는 크롤러의 `performLogin`을 부르지만 소노·리솜·오크밸리는 스크립트가
폼을 직접 몬다) "사이트에 로그인이 되나"까지만 말해준다. `login-check.ts`는 5곳 모두에서
`registry` → `crawler.login()` → `validateSession()`으로 **`run.ts`와 같은 경로**를 태우므로
"크롤러의 로그인이 되나"에 답한다. `crawl_logs`·`resort_sessions`·`resort_inventory`에
아무것도 쓰지 않고(`--save` 명시 시 세션만 저장), 재시도하지 않으며(실계정 잠금 위험),
자격증명은 길이만 찍는다. 순차 실행이고, 실패 스크린샷을 남기려면 `CRAWLER_DEBUG_DIR`이
필요하다 — 없으면 각 크롤러가 스크린샷을 조용히 건너뛴다.

```bash
CRAWLER_DEBUG_DIR=/tmp/login-check npx tsx scripts/login-check.ts          # 5곳 전부
npx tsx scripts/login-check.ts HANWHA SONO                                 # 일부만
```

**`doLogin`은 이제 세션을 `/tmp/lotte-debug-state.json`에 남긴다**(나머지 네 크롤러의
디버그 스크립트와 같은 규약). 롯데는 다섯 중 로그인이 가장 무르고 실계정이 법인 계정이라
반복 실패에 잠금 위험이 있어서, 조사가 질문마다 로그인하면 그 위험을 질문 수만큼 곱한다 —
**조사는 로그인 1회로 끝나야 한다.** 저장은 성공 분기에서 `checkLoggedIn`을 한 번 더
물어보고서만 한다(실패한 로그인의 쿠키를 남기면 이후 모든 스텝이 익명 질문에 답하면서
"인증됐다"고 주장한다).

⚠️ **`keys`·`roomlist`는 그 파일을 일부러 읽지 않는다**(`ANON_STEPS`). 둘은 비로그인인
것이 설계이고, `AGENTS.md`의 정원 표가 그 census의 출처를 "비로그인 BAR 호출"이라고
명시한다. 세션이 생겼다는 이유로 조용히 인증되기 시작하면 같은 명령이 **다른 질문에
답하면서 예전 표와 나란히 비교된다.** 그래서 모든 스텝이 출력 첫 줄에 자기 상태를 찍는다
(`[state] anonymous by design` / `[state] reusing … age=12m`).

**`member` 스텝이 존재하는 이유**: `keys`는 "이 응답에 무엇이 있나"를 묻고, 이건
**"신원이 이 응답을 바꾸는가, 안 바꾼다면 사이트는 무엇을 다르게 묻는가"**를 묻는다.
질문 순서는 **로그인 비용 우선**이고(Q1 익명 census → Q2 인증/익명 대조 → Q3 사이트 요청
녹화 → Q4 대안 `rsvType`), 각 질문은 로그가 아니라 판정을 찍는다. 지켜야 할 것 둘:
- **세션이 없으면 Q2를 건너뛴다.** 익명↔익명 대조의 출력은 글자 하나 다르지 않게
  "로그인은 아무 차이도 만들지 않는다"로 읽힌다 — 이 조사가 낼 수 있는 최악의 오답이다.
- **Q4는 후보가 있을 때만 돈다.** 모르는 `rsvType`에 사이트가 200으로 BAR 목록을 그대로
  돌려주면 "회원가와 공시가가 같다"는 틀린 결론이 나온다(오크밸리 `probe`의 교훈).
  수용 규칙은 **같은 실행의 BAR 기준선과 다를 때만** — 실측에서 유일한 후보 `PRO`는
  인증·익명 모두 **0행 REJECTED**였다.

`drop-session.ts`가 필요한 이유: 유효한 세션이 있으면 크롤이 성공해도 **로그인에
대해서는 아무것도 말해주지 않는다**(`session valid, skipping login`). 로그인 경로를
검증하려면 세션을 지우고 시작해야 한다. 반대로 로그인 실패를 조사할 때는 시도가
실계정에 쌓인다는 것도 같이 기억할 것 — 반복 실패는 잠금 위험이 있다.

성공 조건:
- `crawl_logs`: `status=SUCCESS`, `rows_upserted > 0`
- `resort_inventory`에 행 upsert, `checkin_date`가 KST 오늘의 UTC 자정과 일치
- `resort_sessions`에 storage_state 저장, 6시간 내 재실행 시 로그인 스킵

스케줄러(Phase C) 검증:

```bash
npm run inngest:dev        # 별 터미널: Inngest dev server (localhost:8288)
npm run dev                # 별 터미널
# 대시보드에서 scheduled-refresh를 Invoke 하거나, 이벤트를 직접 발행:
#   resort/crawl.requested  { "slug": "LOTTE", "windows": [{"checkin":"2026-08-10","checkout":"2026-08-11"}] }
```

`windows`를 생략하면 핫 윈도우 60개(30일 × 1~2박)를 전부 돈다 — 실사이트에 240 API콜이
나가므로 스모크 테스트에는 `windows`를 2~3개만 명시할 것.

로그인 실패 시 `CRAWLER_DEBUG_DIR=<dir>` 지정하면 `lotte-login-failed.png` 스크린샷 저장.
사이트 구조 탐색은 `scripts/debug-page.ts`의 스텝(main/login/lpoint/resort/search/dom/bizcds/roomlist) 활용.

## Resort 활성화

검증 통과 후:

```bash
npx tsx scripts/set-active.ts LOTTE true    # 끌 때는 false
```

`active` 하나가 두 가지를 동시에 켠다 — `listCrawlableResorts()`가 3시간 크론을
그 리조트에 팬아웃하고, `getSearchCatalog()`가 조회 화면에 지점을 노출한다.
둘 다 코드 쪽 절반(등록된 크롤러 / `CATALOG` 등재)을 함께 요구하므로 스크립트가
그것도 같이 찍는다. 한쪽이 빠져 있으면 에러가 아니라 **빈 필터**로 나타난다.

## 지점 제외 (2026-08-29)

제휴가 없는 지점을 조회·수집에서 뺀다. 관리 화면은 `/admin/properties`이고 CLI는:

```bash
npx tsx scripts/set-exclusion.ts HANWHA "산정호수" "제휴 없음"
npx tsx scripts/set-exclusion.ts HANWHA "산정호수" --include
```


**`Resort.active`와 다른 스위치다.** `active`는 리조트 전체이고 `listCrawlableResorts()`
에서 **팬아웃 자체가 멈춘다**. 제외는 지점 단위이고 **크롤은 그대로 돌되 그 지점만 빠지며,
그 지점의 `resort_inventory` 행을 즉시 지운다**(복구해도 다음 수집 전까지는 비어 있다).

- **표는 지점 목록이 아니라 빼는 규칙이다.** `resort_branch_exclusions`는
  `(resort_id, branch_name)` 한 쌍이고 **행이 있으면 제외 · 없으면 노출**이다. 카탈로그에
  없는 이름은 아무것도 걸러내지 않는 **무동작**이라, 이 표는 지점을 만들어 낼 수 없다.
  그 무동작은 조용하므로 두 곳이 이름을 댄다 — `excludeProperty`가 생성을 거부하고,
  `/admin/properties`가 "카탈로그에 없는 제외 규칙" 블록으로 그린다.
  (CLI는 생성도 거부하지 않고 `catalog match: no`만 찍는다 — 이름이 바뀐 뒤 남은 고아
  규칙을 지우는 것이 정당한 사용이라, 대조로 막으면 그 정리가 불가능해진다.)
- **리조트의 마지막 지점은 뺄 수 없다.** 지점이 0곳이면 그 리조트는 매 핫 윈도우에서
  0행이 되고, 백스톱의 판정이 `covered === 0 → fresh:false`라 09:00 크론에 더해 12:00
  백스톱이 **매일** 재수집한다. 리조트를 끄는 스위치는 이미 `active`다.
- 크롤 경로의 적용점은 `_shared/branches.ts`의 `selectBranches` 하나이고, 제외 목록은
  `run.ts`가 `ResortBranchExclusion`에서 읽어 그 패스의 모든 윈도우에 얹는다.
- 크롤이 제외와 경주해 남은 행은 `scheduled-refresh`의 `purge-excluded-inventory`가
  걷는다. 그 숫자는 **평상시 0이어야 한다.**

## 수동 요금 (2026-09-02)

사이트가 금액을 주지 않는 객실에 운영자가 **1박 단가**를 직접 넣는다. 넣는 곳은 조회
결과의 객실 행이고, 관리 화면은 `/admin/rates`, CLI는:

```bash
npx tsx scripts/set-room-rate.ts SONO                                   # 그 리조트의 요금 나열
npx tsx scripts/set-room-rate.ts SONO "소노벨 제주" "리조트 스위트" 170000 "2026 요금표 주중"
npx tsx scripts/set-room-rate.ts SONO "소노벨 제주" "리조트 스위트" --delete
```

**`ResortInventory.price`와 다른 표다**(`resort_room_rates`). 저 컬럼은 크롤과 수명을
공유해서(`run.ts`의 `price = EXCLUDED.price`, COALESCE 금지) 요금 없이 도는 다음 크롤이
반드시 지운다 — 수동 요금은 그 등식 밖에 있어야 한다. 상세와 설계 근거는 `CLAUDE.md`의
"수동 요금 입력" 절.

- **조인 키가 둘이고 둘 다 조용히 어긋날 수 있다** — `branchName`과 `roomType`. 어느 쪽이
  틀려도 에러가 아니라 **무동작**이고 증상은 "요금을 넣었는데 조회 화면이 빈칸"이다.
  그래서 CLI가 매번 `catalog match`(지점)와 `inventory match`(객실유형)를 함께 찍는다.
  · **`roomType`은 대조로 막지 않는다.** 카탈로그가 없는 축이고(사이트가 정한다),
    이름이 바뀐 뒤 남은 고아 요금을 지우는 것이 정당한 사용이라 생성을 거부하면 그 정리가
    불가능해진다 — `set-exclusion.ts`가 카탈로그 대조를 **보고만** 하는 것과 같은 판단이다.
  · 화면에서는 오타가 생길 자리가 없다. 입력 다이얼로그가 **항상 실제 조회 행에서 열려**
    그 행의 값을 그대로 싣는다. `/admin/rates`가 요금을 만들지 않는 이유도 이것이다.
- **자동 수집 요금이 우선이다.** 요금이 이미 있는 행에는 입력 버튼이 뜨지 않는다.
  ⚠️ 그래서 **한화 요금 조인이 언젠가 뚫리면 그 지점의 수동값은 화면에서 조용히 사라진다** —
  지워지는 것이 아니라 가려지는 것이고, `/admin/rates`에는 계속 보인다.
- **요일·시즌 축이 없다.** 금·토가 더 비싼 실제 요금표를 평일 값으로 주장하므로, 어느 기준으로
  넣었는지는 `note`에 적는다. 특히 **소노는 뷰 변형이 접힌 행**이라(`parse.ts`가 570그룹 중
  300개를 접는다) "그 방의 값"이 하나가 아닐 수 있다 — 접힌 축을 `note`에 명시할 것.
  2026-09-11부터 행을 펼치면 그 변형 목록이 보이므로 거기 라벨을 그대로 적으면 된다.
- **`note`는 평문이고 관리 표에 마스킹 없이 그려진다.** `ResortAccount.memo` 전례를 볼 것.

검증 SQL:

```sql
-- 단가가 양수인가 (0·음수는 "요금 없음"과 뜻이 겹친다)
SELECT count(*) FROM resort_room_rates WHERE per_night <= 0;                 -- 0

-- 크롤러가 이 어휘를 발행하면 안 된다
SELECT count(*) FROM resort_inventory WHERE price_kind = 'manual';           -- 0

-- 지금 아무 행에도 안 붙는 요금. 0이 아니어도 되지만 /admin/rates가 알려야 한다.
-- ⚠️ 그 지점의 재고가 0행이면 판정 보류다 — 아직 안 물어본 것과 사라진 것은 다르다.
SELECT r.branch_name, r.room_type FROM resort_room_rates r
 WHERE EXISTS (SELECT 1 FROM resort_inventory i
                WHERE i.resort_id = r.resort_id AND i.branch_name = r.branch_name)
   AND NOT EXISTS (SELECT 1 FROM resort_inventory i
                    WHERE i.resort_id = r.resort_id
                      AND i.branch_name = r.branch_name
                      AND i.room_type = r.room_type);
```

## 마감일 계산기 (D-10 · 결과만 휴일 보정)

사이드바 위젯의 계산·공휴일 파싱을 단독으로 확인한다. 테스트 러너가 없으므로 `golden`이
사실상 이 기능의 회귀 테스트다 — **네트워크도 키도 없이 돌고**, 나머지 스텝도 전부 키가 없다.

```bash
npx tsx scripts/debug-holidays.ts golden          # 걷기 10 + 파서 10, 오프라인
npx tsx scripts/debug-holidays.ts feed [2026]     # 라이브 피드 요약 + 정규화 결과
npx tsx scripts/debug-holidays.ts diff            # 라이브 ↔ 인라인 픽스처, 차이 있으면 exit 1
npx tsx scripts/debug-holidays.ts calc 2026-10-05 # 2단계를 한 줄씩
```

**규칙은 영업일 카운트가 아니고, 기준일은 보정하지 않는다**(2026-09-09 교체).
① 기준일에서 **달력 10일을 뺀다**(= `-10`일. 기준일이 주말·공휴일이어도 그대로) →
② 그 날이 주말/공휴일이면 직전 영업일로 당긴다. 옛 규칙(09-02)에 있던 "기준일이 휴일이면
먼저 당긴다"와 "기준일을 1일째로 포함(−9)"이 둘 다 사라졌다.

`calc`가 표를 찍는 이유는 오크밸리 `probe`·한화 `cal`과 같다: 답이 틀렸을 때 "틀렸다"가
아니라 **어디서 갈렸는지**가 보여야 한다. 기준선은 `2026-10-05(월, 쉬는 날 개천절) →
2026-09-23(수)` — 기준일이 공휴일인데 보정 없이 −10일 = 9/25 추석 → 9/24 추석 연휴 → 9/23.
짝은 `2026-10-19(월) → 2026-10-08(목)`(10/9 한글날 → 10/8).

- **`diff`는 감시 장치다.** 공휴일 정책 뉴스가 보이거나 마감일이 이상하면 여기부터 돌린다.
  구글이 `DESCRIPTION` 표기를 바꾸거나 새 임시공휴일을 넣으면 여기서 먼저 보인다 —
  개수 바닥이 못 잡는 종류의 변화(라벨이 셋으로 갈라지는 경우)는 **이것 말고 잡을 것이 없다.**
- **`feed`의 `DESCRIPTION 분포` 줄이 그 감시선이다.** `{공휴일, 기념일}` 말고 다른 이름이
  보이면 그때가 손볼 때다.
- 이 스크립트는 **프로덕션과 같은 파서**(`src/lib/holidays-ical.ts`)를 쓴다. 특일정보 시절엔
  일부러 재사용하지 않았는데, 소스가 바뀌며 가장 위험한 코드가 걷기에서 파싱으로 옮겨가
  그 판단이 뒤집혔다. 상세는 `CLAUDE.md`의 "마감일 계산기" 절.
- **`golden`의 판별 케이스 둘이 새 규칙의 두 축을 각각 혼자 지킨다.** 운영자 예시
  둘(10/5·10/19)은 옛 규칙과 새 규칙이 **같은 답**을 내서 그 둘만으로는 교체가 검증되지
  않는다. `2026-08-17(쉬는 날 광복절) → 2026-08-07`은 "기준일을 보정하지 않는다"를
  (옛 규칙이면 8/5), `2026-10-16 → 2026-10-06`은 "기준일 비포함 −n"을(−(n−1)이면 10/7) 고정한다.

## 날짜 규약

"YYYY-MM-DD" 문자열 ↔ `parseDate()`(UTC 자정 Date)만 사용. Date를 로컬 API로
생성/해석 금지 (`todayKstIso`/`addDaysUtc` 유틸 사용, getter는 항상 `getUTC*`).

---

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성.
   가장 가까운 것을 복사한다 — 지점마다 한 콜이면 **lotte**, 한 콜에 여러 지점이면
   **sono**, 응답이 날짜 달력이거나 API가 쿠키가 아니라 토큰을 요구하면 **resom**,
   요청을 URL로 조립할 수 없거나(서명·토큰이 페이지에 있음) 응답이 월 단위라
   여러 응답을 병합해야 하면 **oakvalley**, 로그인이 화면 여러 개거나 지점이 많아
   한 패스에 다 못 도는 규모면 **hanwha**.
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. `src/lib/resort-catalog.ts`의 `CATALOG`에 `{ properties }` 1항목 추가 —
   지점의 `branchName`/`label`/`region`만 뽑는다. **`bizCd` 등 크롤 전용 필드는 넣지 않는다**
   (이 모듈은 `server-only`지만, 넣으면 서버 컴포넌트가 클라이언트로 내려보내게 된다).
4. `/admin/accounts`에서 해당 리조트 자격증명 등록 (없으면 `run.ts`가 throw)
5. `npx tsx scripts/set-active.ts <SLUG> true`

새 리조트의 지점은 제외 행이 없으므로 **전부 기본 노출**이다. 제휴가 없는 지점은
`/admin/properties`에서 뺀다(위 "지점 제외" 절). 지점 필터링은 크롤러가 아니라
`_shared/branches.ts`의 `selectBranches`가 하므로, 새 크롤러도 `config.branches`를
직접 순회하지 말고 그 헬퍼를 부를 것 — 안 부르면 제외가 그 리조트에만 적용되지 않고,
증상은 에러가 아니라 "뺐는데 계속 수집된다"이다.

핵심 코드(`run.ts`, `_shared/*`)는 물론 **Inngest 함수·조회 UI·`/api/inventory`도 무수정**이다.
`crawl-resort`는 slug를 인자로 받는 단일 함수이고(리조트별 함수가 아니다),
`scheduled-refresh`가 `listCrawlableResorts()`(= `active` ∩ 등록된 크롤러)로 팬아웃한다.

**지점이 여럿이면 순차로 돌지 말 것.** 패스 하나가 브라우저 하나이고, 브라우저는
이 프로젝트에서 가장 먼저 바닥나는 자원이다(`CLAUDE.md`의 "배포" 절). `_shared/pool.ts`의
`mapPool`은 절대 reject하지 않고 결과를 **입력 순서대로** 주므로, "한 지점 실패가 나머지를
죽이면 안 된다"는 이 저장소의 규칙을 그대로 지킬 수 있다. 다만 예산 게이트가 있는
크롤러라면 게이트를 **배치 사이**로 옮기고 척도를 배치 단위로 바꿔야 하고, 콜 타임아웃은
상수가 아니라 **남은 예산**에서 유도해야 한다 — 상세는 `docs/crawlers/hanwha.md`.

**`/tmp` 고갈은 `TmpExhaustedError`이고 크롤러가 던질 일은 없다.** `_shared/browser.ts`가
launch 전에 판정한다. 크롤러가 알아야 할 것은 하나뿐 — 이 예외는 세션과 무관하므로
`run.ts`가 저장된 storageState를 버리지 않는다.

**세션이 죽은 것을 알아챘을 때는 `SessionLostError`(`_shared/errors.ts`)를 던질 것.**
평범한 `Error`를 던지면 `run.ts`가 그것을 검색 실패로 읽어 **캐시된 storageState를
그대로 남기고**, 다음 시도가 `validateSession`을 통과해 로그인을 건너뛰고 같은 실패를
반복한다. 반대로 제대로 던지면 `run.ts`가 **그 패스 안에서 1회 회복**한다 — 세션 폐기
→ 재로그인 → 같은 윈도우 재시도. 세션을 잃었을 때 필요한 것은 로그인 한 번이지
브라우저 한 벌이 아니고, 재시도에 맡기면 그 브라우저를 **더 마른 `/tmp`에** 띄우게
된다(2026-08-26 09:07이 그 청구서다). 다섯 크롤러 전부 그 자리가 있다 — 토큰이 없거나(리솜), 회원번호를 못 받거나
(소노), 로그인 화면으로 튕기거나(오크밸리), 재고 호스트가 우리를 모르는(한화) 순간이다.
**로그인 호스트와 재고 호스트가 다르면 이건 선택이 아니다**: `validateSession`이 보는
호스트와 세션을 잃는 호스트가 달라서, 검증 통과가 크롤 가능을 뜻하지 않는다.

추가 후 확인 — 지점 문자열이 카탈로그와 실제 수집 결과 사이에서 어긋나지 않았는지:

```sql
SELECT DISTINCT resort_name, branch_name, region FROM resort_inventory ORDER BY 1, 2;
```

`branchName`은 크롤러 config의 `value`가 그대로 저장된 값이고 카탈로그도 같은 배열을
읽으므로 자동으로 일치해야 한다. 어긋난다면 크롤러가 `config.branches`를 우회해
지점명을 만들고 있다는 뜻이다 (증상은 "필터를 눌렀는데 0건").

⚠️ **다만 지점이 빠져 있는 것은 이제 정상일 수 있다** (2026-08-29). 운영자가 제외한
지점은 크롤이 돌지 않으므로 이 결과에 나오지 않는다. 어긋나 보이면 크롤러를 의심하기
전에 `resort_branch_exclusions`를 먼저 볼 것 — 위 "지점 제외" 절.

## 요청한 날짜보다 넓게 답하는 사이트 (`InventoryRow.stay`)

기본값은 "크롤러가 돌려준 행 = 요청한 윈도우의 재고"이고, 롯데가 그렇다. 사이트가
요청 날짜 하나에 **여러 날짜를 한꺼번에** 답한다면 행마다
`stay: { checkin, checkout }`을 붙여라. 그러면

- `run.ts`가 그 행을 요청 윈도우가 아니라 **행 자신의 날짜** 아래 upsert하고,
- **그 패스에서 이미 답을 받은 윈도우를 건너뛴다.** 소노의 60개 핫 윈도우가
  실제 요청 4번(2개월 × 2숙박길이)이 되는 게 이 스킵이다 — 실측 40초·17,914행.

`stay`를 안 붙이면 동작은 종전과 완전히 동일하다.

주의할 점 셋:

- **`windows.ts`에 리조트별 상수를 두지 않는다.** 응답이 며칠을 덮는지는 크롤러만
  관측할 수 있고, 스케줄러에 사본을 두면 어긋났을 때 증상이 "그 날짜만 조용히 빔"이다.
  스킵은 실제로 받은 행에서 계산되므로 그런 사본이 없다.
- **`checkin`/`checkout`은 둘 다이거나 둘 다 아니다.** 하나만 주면 나머지가 요청
  윈도우에서 상속돼, 아무도 측정하지 않은 숙박 길이를 주장하게 된다.
- **넓은 응답이 곧 "그 숙박이 가능하다"는 뜻은 아니다.** 소노처럼 날짜별 달력을 주는
  사이트라면 숙박 일수만큼 AND 해야 한다(`docs/crawlers/sono.md`). 판정할 밤이 없으면 행을
  만들지 말 것 — 없는 행은 조회에서 "데이터 없음"이지만, 틀린 행은 헛걸음이다.
- **예산이 끊겨 지점을 다 못 돌았으면 `stay`를 지우지 말고 요청 윈도우로 좁혀라.**
  `stay`를 지우면 응답이 덮은 날짜가 전부 요청 윈도우 아래로 들어가고, upsert 중복
  제거가 그걸 한 날짜로 뭉갠다 — 한화에서 5,520행이 120행이 되고 남은 행이 미래
  날짜의 상태를 오늘 것으로 주장했다. 반대로 `stay`를 그대로 두면 못 돈 지점 몫까지
  윈도우가 스킵되고, 루프 순서가 고정이라 같은 지점이 매번 빠진다. 상세는 `docs/crawlers/hanwha.md`.

행 수가 크게 늘 수 있다는 것도 염두에 둘 것. `upsertInventory`는 다중행 INSERT 한
문장이라 Postgres의 바인드 파라미터 상한 65,535(행당 17개, 2026-09-11 현재)에 걸린다 —
`UPSERT_CHUNK_ROWS`로 1,000행씩 끊는다. 소노 한 콜이 ~3,900행이다.

## 어제 있었고 오늘 응답에 없는 행

위 절은 **행을 만들지 않는 규칙**만 말한다. 이미 있던 행이 어떻게 되는지는 오래 말하지
않았고, 그 침묵이 13일짜리 유령을 만들었다 — 2026-08-24 롯데 속초 8/24→8/25에서 16행은
그날 갱신됐는데 호텔 객실 3종만 08-11의 `available=true`를 단 채 남아 조회 화면 맨 위에
초록 배지로 떠 있었다. 실제 사이트에는 그 방이 없었다.

쓰기 경로가 순수 upsert(`ON CONFLICT DO UPDATE`)라서 **응답에 없던 키는 아무도 건드리지
않는다.** 그래서 `run.ts`의 `removeVanishedRows`가 upsert 직후에 그것을 지운다.

- 판정 단위는 `(지점, 체크인, 체크아웃)` 그룹. 규칙은 하나다 —
  **그 그룹에서 1행 이상 받았다면 사이트가 그 지점·그 날짜에 대해 답한 것**이고,
  그 답에 없는 객실은 지금 예약할 수 없다.
- **0행 그룹은 절대 건드리지 않는다.** 그룹 목록을 방금 쓴 행에서 뽑으므로 자동으로
  보장된다. 이게 이 함수의 전부다 — 지점 단위 실패는 조용히 0행이 되는데
  (`lotte/search.ts`가 예외를 삼키고 계속한다) 그걸 "전부 마감"으로 읽으면 크롤 실패가
  **"전 객실 매진"으로 발행**된다.
- **새 크롤러가 지점 루프에서 예외를 삼킨다면 이 규칙에 기대고 있는 것이다.** 삼킨 지점이
  0행이 되어 그룹에 오르지 않기 때문에 안전하다. 반대로 "실패한 지점도 빈 행 목록을
  만들어 둔다"는 식의 구현을 하면 그 순간 크롤 실패가 매진이 된다.
- 마킹이 아니라 삭제인 이유: 사라진 행에는 "예약 불가"와 "판정 못 함"이 섞여 있다
  (소노·리솜·오크밸리·한화는 밤 하나가 결측이면 행을 만들지 않는다). 판정할 수 없으면
  행을 만들지 않는다는 이 문서의 규약과 삭제가 같은 말이다. 지워진 자리는 조회에서
  "데이터 없음"이고, 다음 크롤이 답을 받으면 그대로 복구된다.

그리고 지워지지 않은 낡은 행은 **조회 화면이 등급을 낮춰서** 처리한다 —
`src/lib/freshness.ts`가 나이를 판정하고 3일이 넘은 "예약 가능"은 `unverified`
("N일 전 확인")로 내려간다. 즉 크롤러가 못 지운 유령은 화면이 한 번 더 거른다.
새 크롤러를 붙일 때 이 두 층을 모두 신뢰해도 되지만, **아래층(삭제)을 무력화하는
구현은 하지 말 것** — 위층은 나이만 알 뿐 "사이트가 뭐라 답했는지"는 모른다.
