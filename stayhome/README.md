# Welfare Stay

사내 제휴 리조트(롯데·리솜·한화·오크밸리·소노) 통합 잔여 객실 조회 시스템.
복지 담당자 1인 전용 내부 도구이며, 5개 리조트 사이트에 각각 로그인해 조회하던
반복 업무를 단일 화면으로 통합한다.

## 현재 상태 — 운영 중 (2026-08-09~)

리조트 **3곳**(롯데·소노·리솜)을 3시간마다 자동 수집한다.

- ✅ Next.js 16 + React 19 / Tailwind v4 + shadcn v4 (`base-nova`) + Noto Sans KR
- ✅ Prisma 7 + Neon (User/Resort/ResortAccount/ResortSession/ResortInventory/CrawlLog/AuditLog)
- ✅ NextAuth v5 **Credentials**(ID/PW · bcrypt) + JWT 세션
- ✅ AES-256-GCM 자격증명 암호화 + 감사 로그 · `/admin/accounts`(마스킹/등록/복호화)
- ✅ 크롤러: 롯데 4지점 · 소노 32지점 · 리솜 3지점 (`src/crawlers/<slug>/`)
- ✅ 스케줄러: Inngest 크론(3시간) → 리조트 팬아웃 → step 분할 크롤 · `/admin/crawl-logs`
- ✅ 조회 UI: 월 캘린더 + 리조트/지역/지점 3축 필터 + 라이브 "최신화"
- ✅ PWA (manifest + 자체 작성 `sw.js` + 오프라인 폴백 + 멀티 브라우저 설치 프롬프트)
- ✅ Vercel 배포 (`stayhome-khaki.vercel.app`, `stayhome` 브랜치 push → 자동 배포)
- ⏳ 한화 · 오크밸리 크롤러
- ⏳ 크롤 실패 알림(`SLACK_WEBHOOK_URL` 미설정) · 웹 푸시 구독 플로우

전체 설계는 `prd.md`, 작업 규약은 `CLAUDE.md` / `AGENTS.md` 참조.

## 시작하기

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집: DATABASE_URL, DIRECT_URL, AUTH_SECRET, RESORT_CRED_SECRET

# 2. RESORT_CRED_SECRET 생성 예시
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. DB 스키마 적용
npm run db:push

# 4. 초기 시드 (관리자 계정 + 5 리조트 행)
npm run db:seed

# 5. 개발 서버
npm run dev
```

## 환경변수

`.env.example` 참조. 필수:
- `DATABASE_URL` — Neon pooler 연결 문자열
- `DIRECT_URL` — Neon direct 연결 (migrate 전용)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `RESORT_CRED_SECRET` — 32B base64 (AES-256 키)
- `CRON_SECRET` — Cron 보호용 임의 문자열

프로덕션 전용:
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Vercel-Inngest 통합이 직접 심는다
- `CHROMIUM_PACK_URL` — `@sparticuz/chromium-min` **및 `playwright-core`가 기대하는
  크로미움 버전**과 일치하는 tarball URL. 셋이 어긋나면 launch는 되고 나중에 깨진다
  (`CLAUDE.md` 배포 절 참조)

## 로그인 계정

`prisma/seed.ts`가 `users` 테이블에 관리자 1명(`admin`)을 만든다. 비밀번호는
bcrypt 해시로 저장되며 시드 값은 개발용이므로 **운영에서는 반드시 바꿀 것**.
계정 추가는 `users`에 행을 넣는 것이 전부다 — 가입 화면은 없다(1인용 내부 도구).

> `allowed_emails` 테이블은 Google OAuth 시절의 잔재다. 시드가 채우기만 하고
> `authorize()`는 조회하지 않으므로 **여기에 이메일을 넣어도 아무 효과가 없다.**
> 자세한 내용은 `CLAUDE.md`의 "미해결 사항".

## 디자인 메모

- 본 프로젝트는 형제 프로젝트 `pianoflow`의 스택/스타일과 동일하게 맞춰져 있다.
- shadcn `base-nova` 스타일은 base-ui를 사용하며 일반 shadcn(radix)의 `asChild` 대신 `render` prop을 사용한다.
- Prisma 생성 클라이언트는 `src/generated/prisma/`에 출력되며 git 무시.
