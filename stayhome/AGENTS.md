<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Lotte 크롤러 (lottehotel.com 통합 사이트)

lotteresort.com은 2026-07에 LOTTE HOTELS & RESORTS(lottehotel.com)로 통합되었다.
현재 크롤러 구조 (`src/crawlers/lotte/`):

- **로그인만 브라우저 조작**: `www.lottehotel.com/global/ko/login/rewards`에서
  쿠키 동의 → **"L.POINT 로그인" 탭** 클릭 → `input[name=loginId/loginPw]` 입력.
  리조트 회원/법인회원은 리워즈 탭이 아니라 L.POINT 탭이어야 함 (사이트 안내문 기준).
- **검색은 JSON API 직접 호출** (DOM/달력 조작 없음):
  `GET resort.lottehotel.com/api/main/ko/reservation/roomList?rsvType=BAR&bizCd=..&checkinDt=YYYYMMDD&checkoutDt=YYYYMMDD&roomCnt=1`
  — `page.request`로 호출해 로그인 세션 쿠키가 함께 전달됨. 비로그인도 BAR 요금은 응답함.
- **세션 검증도 API**: `GET resort.lottehotel.com/common/login/isLogin` → `{ data: boolean }`.
- **파싱**: `roomList[].roomCnt`(잔여 객실 수) > 0 → available, ≤2 → closingSoon.
  빈 roomList는 만실(AVAILRSV)/예약미오픈(NORSV)으로 정상 0행 처리.
- 지점별 `bizCd`: 속초=81, 부여=61, 제주 아트빌라스=71, 김해=91.
  (산정호수는 통합 시 라인업 제외. bizCd 출처: CMS 카탈로그
  `resort.lottehotel.com/cms/common/hotel-catalogs/ko_catalogs.json`의 `anotherBookingUrl`)

## 로컬 검증

```bash
npx playwright install chromium    # 최초 1회
# /admin/accounts에 L.POINT 자격증명(실계정) 등록 후:
npx tsx scripts/run-crawl.ts       # 수동 크롤 (RefreshButton과 동일 경로)
npx tsx scripts/check-logs.ts      # crawl_logs / inventory / sessions 확인
npx tsx scripts/debug-page.ts roomlist   # 로그인 없이 검색+파싱 파이프라인만 테스트
```

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
```sql
UPDATE resorts SET active = true WHERE slug = 'LOTTE';
```

## 날짜 규약

"YYYY-MM-DD" 문자열 ↔ `parseDate()`(UTC 자정 Date)만 사용. Date를 로컬 API로
생성/해석 금지 (`todayKstIso`/`addDaysUtc` 유틸 사용, getter는 항상 `getUTC*`).

---

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성 (lotte 복사 후 수정)
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. `src/lib/resort-catalog.ts`의 `CATALOG`에 `{ properties }` 1항목 추가 —
   지점의 `branchName`/`label`/`region`만 뽑는다. **`bizCd` 등 크롤 전용 필드는 넣지 않는다**
   (이 모듈은 `server-only`지만, 넣으면 서버 컴포넌트가 클라이언트로 내려보내게 된다).
4. `/admin/accounts`에서 해당 리조트 자격증명 등록 (없으면 `run.ts`가 throw)
5. Neon에서 `UPDATE resorts SET active = true WHERE slug = '<SLUG>'`

핵심 코드(`run.ts`, `_shared/*`)는 물론 **Inngest 함수·조회 UI·`/api/inventory`도 무수정**이다.
`crawl-resort`는 slug를 인자로 받는 단일 함수이고(리조트별 함수가 아니다),
`scheduled-refresh`가 `listCrawlableResorts()`(= `active` ∩ 등록된 크롤러)로 팬아웃한다.

추가 후 확인 — 지점 문자열이 카탈로그와 실제 수집 결과 사이에서 어긋나지 않았는지:

```sql
SELECT DISTINCT resort_name, branch_name, region FROM resort_inventory ORDER BY 1, 2;
```

`branchName`은 크롤러 config의 `value`가 그대로 저장된 값이고 카탈로그도 같은 배열을
읽으므로 자동으로 일치해야 한다. 어긋난다면 크롤러가 `config.branches`를 우회해
지점명을 만들고 있다는 뜻이다 (증상은 "필터를 눌렀는데 0건").
