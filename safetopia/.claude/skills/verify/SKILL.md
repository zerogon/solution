---
name: verify
description: safetopia 앱을 실제로 띄워 변경을 눈으로 확인하는 레시피 — dev 서버, 로그인 curl 플로우, 역할별 스크린샷
---

# safetopia 검증 레시피

## 빌드/실행
- `npm run db:local:up` → `npm run dev` → http://localhost:3000 (`.env.local`이 로컬 Docker Postgres 5434를 가리킨다)
- 정적: `npm run typecheck`, `npm run lint`, `npm test`(vitest), `npm run race-test`(1단계 동시 신청 1/9, 2단계 잔액 행 지연 생성 1)

## 로그인 (NextAuth v5 Credentials, curl)
시드 계정: `admin`/`admin1234`, `emp01`/`1234`(변경 완료), `emp03`/`1234`(비번 변경 강제 → `/account/password`), `retired01`(차단).

```bash
B=http://localhost:3000; JAR=cookies.txt
CSRF=$(curl -s -c $JAR $B/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -b $JAR -c $JAR -X POST $B/api/auth/callback/credentials \
  -d "csrfToken=$CSRF&loginId=admin&password=admin1234"
# 성공: 302 → / , 실패: 302 → /login?error=CredentialsSignin
curl -s -b $JAR $B/admin/dashboard   # SSR HTML
```

기대 동작: 직원이 `/admin/*` → `/`로 302, 비로그인 → `/login?from=…`, `mustChangePassword` 사용자는 모든 셸 경로가 `/account/password`로 307, `/offline`·`/manifest.json`은 비로그인 200.

## 인증된 스크린샷 (playwright CLI + 시스템 Chrome)
프로젝트에 playwright 없음. `npx -y playwright screenshot --channel=chrome`(시스템 google-chrome). cookies.txt → storage state JSON 변환 시 **`#HttpOnly_` 접두 행을 벗겨서** 파싱해야 `authjs.session-token`이 들어간다.

```bash
npx -y playwright screenshot --channel=chrome --load-storage=storage.json \
  --viewport-size=1280,1200 --wait-for-timeout=2500 http://localhost:3000/admin/dashboard admin.png
npx -y playwright screenshot --channel=chrome --load-storage=storage.json \
  --viewport-size=390,844 --wait-for-timeout=2500 http://localhost:3000/dashboard mobile.png
```

## 확인할 만한 화면
- 직원: `/dashboard`(KPI 3 + 다가오는 휴가 + 최근 신청, 미래 확정 건엔 신청 취소 버튼), `/leave/request`(DaysPreview 제외 내역), `/leave/history`, `/calendar`, `/profile`
- 관리자: `/admin/dashboard`(KPI + 헤더 달 이동 + 최근 신청 5건·행별 취소. md 이상은 지점별 직원×날짜 월간 보드 + 행 끝 잔여 막대 + 이름·잔여 열 고정, md 미만은 월 캘린더에 휴가자 이름), `/admin/employees`, `/admin/employees/[id]`, `/admin/branches`, `/admin/leaves`
- 모바일 390px: 하단 탭 4개(직원)/5개(관리자), 카드 UI

## 연차 자동 발생(입사일 기준) 확인 지점
시드가 입사일을 까다로운 자리로 골라 둔다 — 부여 일수는 어디에도 하드코딩돼 있지 않다.
- `emp03`(입사 95일) → 3일 + "다음 발생" 안내, `emp06`(1주년 직전) → 11일
- `emp01`(만3년) → 16일, `emp07`(만24년) → 상한 25일, `emp05`(1/31 입사)·`emp08`(2/29 입사) → 회차가 매년 그 날로 돌아오는지
- 신규 등록: 입사일 `2019-05-20` 입력 → 폼에 "8년차 · 자동 부여 18일" 미리보기 → 저장 후 상세에 즉시 반영
- `/admin/employees/[id]`: 회차 카드에 `자동`/`수동` 배지. 수동 20일 부여 → 배지 `수동` → "자동 계산 사용" 켜서 원복
- 회차 경계를 넘는 신청은 `period_boundary`로 막히고, **해를 넘겨도 같은 회차면 통과**한다
- 입사일 수정(3/2 → 5/20) → 회차 라벨이 이동하고 잔여·사용은 그대로, 감사 로그에 `hireDateFrom/To` 기록

## 주의
- SSR HTML에서 텍스트 카운트 시 RSC flight payload 때문에 **약 2배로 중복** 집계된다
- 날짜는 UTC 자정 규약 — 화면에서 하루 밀리면 `new Date(y,m,d)`류 로컬 생성이 끼어든 것
- 음영(주말·지점 휴무·공휴일)은 **표시 전용**이다. 주말 연차는 그대로 차감된다 — 음영을 보고 차감 로직을 고치지 말 것
- 공휴일은 Google iCal 라이브 피드 — 오프라인이면 신청 폼이 "공휴일 정보를 확인할 수 없음"으로 막힌다(의도)
