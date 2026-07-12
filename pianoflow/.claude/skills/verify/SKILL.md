---
name: verify
description: pianoflow 앱을 실제로 띄워 변경을 눈으로 확인하는 레시피 — dev 서버, 관리자 로그인 curl 플로우, 인증 스크린샷
---

# pianoflow 검증 레시피

## 빌드/실행
- `npm run dev` → http://localhost:3000 (Ready ~1초). `.env.local`이 있으면 로컬 Docker Postgres(5433), 없으면 .env의 Neon 사용
- 타입체크: `npx tsc --noEmit`

## 로그인 (NextAuth v5 Credentials, curl)
계정: 시드 기준 loginId = 휴대폰에서 010 뺀 8자리. **모든 역할이 비밀번호 필수** (학생 포함, 초기값은 휴대폰 끝 4자리). **DB에 따라 관리자 비밀번호가 다름**: 로컬 Docker DB(seed.ts 그대로)는 `admin1234`, Neon dev DB는 기본 규칙(휴대폰 끝 4자리) `0000` — 관리자 loginId는 둘 다 `00000000`. 로컬 더미 학생은 `00500001`~ — 비밀번호는 현재 로컬 DB 기준 끝 4자리(`0001`~). (seed-dummy-students.ts 명시값은 `student1234`지만 초기화를 거쳐 끝 4자리로 바뀐 상태 — 안 맞으면 둘 다 시도)

```bash
JAR=cookies.txt
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF&loginId=00000000&password=0000"
# 성공: 302 → / , 실패: 302 → /login?error=CredentialsSignin
curl -s -b $JAR http://localhost:3000/admin   # SSR HTML 확보
```

## 인증된 스크린샷 (playwright CLI + 시스템 Chrome)
프로젝트에 playwright 없음. `npx -y playwright`는 캐시된 chromium 버전이 안 맞으므로 `--channel=chrome`(시스템 google-chrome) 사용. cookies.txt를 storage state JSON으로 변환할 때 **`#HttpOnly_` 접두 행을 벗겨서** 파싱해야 authjs.session-token이 들어감.

```bash
# cookies.txt → storage.json ({"cookies":[{name,value,domain:"localhost",path,...}],"origins":[]})
npx -y playwright screenshot --channel=chrome --load-storage=storage.json \
  --viewport-size=1280,1200 --wait-for-timeout=2500 http://localhost:3000/admin admin.png
```

## DB 조회/시드 (일회성 스크립트)
tsx 스크립트는 **프로젝트 루트 안에** 만들어야 모듈 해석됨(스크래치패드 밖 경로는 dotenv 등 resolve 실패). 패턴은 `prisma/seed.ts` 상단 참고 (PrismaPg adapter + `src/generated/prisma/client.js`). 실행: `npx tsx scratch-*.mts` 후 삭제.
- 더미 데이터: `scripts/seed-dummy-students.ts`, `seed-dummy-reservations.ts`, `delete-dummy-*.ts`
- 검증용 예약을 직접 만들면 id를 기록해 `deleteMany({where:{id:{in:[...]}}})`로 원복

## 확인할 만한 화면
- `/admin` 대시보드 (오늘 예약 DayTimeline — collapseEmptyHours/now 라인 사용)
- `/admin/reservations`, `/teacher`, `/teacher/peek` — DayTimeline 기본 prop 경로(압축/now 없음) 회귀 확인
- 시간 의존 UI는 KST(UTC+9) 기준: `src/lib/slots.ts`의 kstHourOf/kstMinutesOfDay

## 인터랙션 구동 (클릭·호버가 필요할 때)
playwright CLI는 스크린샷만 가능. 스크립트 구동은 npx 캐시의 playwright를 **절대경로로 import**:

```js
import { chromium } from "/home/zerogon/.npm/_npx/<hash>/node_modules/playwright/index.mjs";
// 경로 탐색: find ~/.npm/_npx -maxdepth 4 -type d -path "*node_modules/playwright"
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ storageState: "storage.json", viewport: {...} });
```
`npx -y -p playwright node script.mjs`는 ESM 해석이 안 돼 실패함. 요소 단위 `locator.screenshot()`은 스크롤 아티팩트가 생길 수 있으니 판정은 전체 페이지 스크린샷 기준으로.

## 주의
- SSR HTML에서 클래스/텍스트 카운트 시 RSC flight payload 때문에 **약 2배로 중복** 집계됨 — 섹션만 잘라서 세거나 나누어 해석
- 시각 라벨은 `20<!-- -->:00` 형태로 주석이 끼어 렌더됨 (정규식 주의)
