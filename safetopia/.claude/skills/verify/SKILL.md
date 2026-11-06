---
name: verify
description: Sulki Holiday 앱을 실제로 띄워 변경을 눈으로 확인하는 레시피 — dev 서버, 로그인 curl 플로우, 스크린샷
---

# Sulki Holiday 검증 레시피

## 빌드/실행
- `npm run db:local:up` → `npm run dev` → http://localhost:3000 (`.env.local`이 로컬 Docker Postgres 5434를 가리킨다)
- Docker가 없으면: `npx pglite-server -p 5455 -m 10`(백그라운드) 후
  `DATABASE_URL=… DIRECT_URL=…`을 `postgresql://postgres:postgres@127.0.0.1:5455/postgres?sslmode=disable`로 주고
  `npx prisma migrate deploy && npx tsx prisma/seed.ts`. **`localhost` 말고 `127.0.0.1`**(::1로 가면 P1001).
- 정적: `npm run typecheck`, `npm run lint`, `npm test`(vitest)

## 로그인 (NextAuth v5 Credentials, curl)
시드 비밀번호 `1234`. 아이디 필드는 없다.

```bash
B=http://localhost:3000; JAR=cookies.txt
CSRF=$(curl -s -c $JAR $B/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -b $JAR -c $JAR -X POST $B/api/auth/callback/credentials \
  -d "csrfToken=$CSRF&password=1234"
# 성공: 302 → / , 실패: 302 → /login?error=CredentialsSignin
curl -s -b $JAR "$B/calendar?m=2026-05"   # SSR HTML
```

기대 동작: 비로그인 → `/login?from=…`, `/offline`·`/manifest.json`은 비로그인 200.

## 인증된 스크린샷 (playwright CLI + 시스템 Chrome)
프로젝트에 playwright 없음. `npx -y playwright screenshot --channel=chrome`(시스템 google-chrome). cookies.txt → storage state JSON 변환 시 **`#HttpOnly_` 접두 행을 벗겨서** 파싱해야 `authjs.session-token`이 들어간다.

```bash
npx -y playwright screenshot --channel=chrome --load-storage=storage.json \
  --viewport-size=1280,1200 --wait-for-timeout=2500 "http://localhost:3000/calendar?m=2026-05&add=2026-05-11" desktop.png
npx -y playwright screenshot --channel=chrome --load-storage=storage.json \
  --viewport-size=390,844 --wait-for-timeout=2500 http://localhost:3000/calendar mobile.png
```

## 확인할 만한 화면 (시드 기준)
- `/` → `/calendar` 307, `/dashboard`·`/leaves`는 404(화면 최소화로 제거)
- `/calendar?m=2026-05`: 요약 "3년차 · 2026.03.04~2027.03.03 잔여 7.5일 · 사용 9.5일 · 발생 15일 + 이월 2일", 5/4·5/6 연차 칩, 5/5 어린이날
- `/calendar?m=2026-03`: 회차 전환 힌트 "3.4(수)부터 3년차 · 발생 15일". `?m=2027-04`: "4년차 … 발생 예정 16일". `?m=2023-06`: "입사 전"
- `&add=2026-05-11`: 등록 창(금~화 범위 → 토·일 제외 3일, 회차 넘김(예: 2027-03-02~03-05) → `period_boundary` 문구, "일수 직접 입력")
- `&entry=<id>`: 수정 창 + "이 기록 지우기". **창은 Base UI 포털이라 SSR HTML에 없다** — 스크린샷으로 본다
- `/settings`: 이름·입사일(2024-03-04, 아래 "오늘 기준 3년차 · 발생 15일"), 연차 회차 표 3행(3년차 15/2/—/9.5/7.5, 2년차 15/—/—/5.5/9.5, 1년차 11/0/11; 연필 = 이월·보정, 되돌리기 = 조정 지우기). 쉬는 요일·비밀번호 화면은 없음
- 모바일 390px: 하단 탭 2개

## 주의
- SSR HTML에서 텍스트 카운트 시 RSC flight payload 때문에 **약 2배로 중복** 집계된다
- 날짜는 UTC 자정 규약 — 화면에서 하루 밀리면 `new Date(y,m,d)`류 로컬 생성이 끼어든 것
- 음영(주말·쉬는 요일·공휴일)은 **표시 전용**이다 — 음영을 보고 차감 로직을 고치지 말 것
- 공휴일은 Google iCal 라이브 피드 — 오프라인이면 자동 계산이 멈추고 "일수 직접 입력"만 된다(의도)
