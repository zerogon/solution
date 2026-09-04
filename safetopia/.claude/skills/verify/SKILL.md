---
name: verify
description: safetopia 앱을 실제로 띄워 변경을 눈으로 확인하는 레시피 — dev 서버, 로그인 curl 플로우, 역할별 스크린샷
---

# safetopia 검증 레시피

## 빌드/실행
- `npm run db:local:up` → `npm run dev` → http://localhost:3000 (`.env.local`이 로컬 Docker Postgres 5434를 가리킨다)
- 정적: `npm run typecheck`, `npm run lint`, `npm test`(vitest), `npm run race-test`(동시 신청 1/9)

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
- 직원: `/dashboard`(KPI 4 + 다가오는 휴가 + 최근 신청), `/leave/request`(DaysPreview 제외 내역), `/leave/history`, `/calendar`, `/profile`
- 관리자: `/admin/dashboard`(승인 대기 + 근무 예정 인원), `/admin/employees`, `/admin/employees/[id]`, `/admin/branches`, `/admin/leaves`
- 모바일 390px: 하단 탭 4개(직원)/5개(관리자), 카드 UI

## 주의
- SSR HTML에서 텍스트 카운트 시 RSC flight payload 때문에 **약 2배로 중복** 집계된다
- 날짜는 UTC 자정 규약 — 화면에서 하루 밀리면 `new Date(y,m,d)`류 로컬 생성이 끼어든 것
- 공휴일은 Google iCal 라이브 피드 — 오프라인이면 신청 폼이 "공휴일 정보를 확인할 수 없음"으로 막힌다(의도)
