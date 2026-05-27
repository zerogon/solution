# Welfare Stay

사내 제휴 리조트(롯데·소노캄·한화·대명·켄싱턴·현대) 통합 잔여 객실 조회 시스템.
복지 담당자 1인 전용 내부 도구이며, 6개 리조트 사이트에 각각 로그인해 조회하던
반복 업무를 단일 화면으로 통합한다.

## 현재 상태 (Phase A 완료)

- ✅ Next.js 16 + React 19 스캐폴드
- ✅ Tailwind v4 + shadcn v4 (`base-nova` 스타일) + Noto Sans KR
- ✅ Prisma 7 스키마 (User/AllowedEmail/Resort/ResortAccount/ResortSession/ResortInventory/CrawlLog/AuditLog)
- ✅ NextAuth v5 Google OAuth + 이메일 화이트리스트
- ✅ AES-256-GCM 자격증명 암호화 + 감사 로그
- ✅ `/admin/accounts` (마스킹/등록/복호화/감사)
- ✅ `/admin/crawl-logs` 스텁
- ✅ PWA (manifest + sw.js + 멀티 브라우저 설치 프롬프트)
- ⏳ Phase B: Lotte 크롤러 (`src/crawlers/lotte/`)
- ⏳ Phase C: Inngest + Vercel Cron
- ⏳ Phase D: 검색 UI
- ⏳ Phase E: PWA 폴리시

전체 설계는 `prd.md`와 `/home/zerogon/.claude/plans/humble-shimmying-spindle.md` 참조.

## 시작하기

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집: DATABASE_URL, DIRECT_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, RESORT_CRED_SECRET

# 2. RESORT_CRED_SECRET 생성 예시
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. DB 스키마 적용
npm run db:push

# 4. 초기 시드 (허용 이메일 + 6 리조트 행)
npm run db:seed

# 5. 개발 서버
npm run dev
```

## 환경변수

`.env.example` 참조. 필수:
- `DATABASE_URL` — Neon pooler 연결 문자열
- `DIRECT_URL` — Neon direct 연결 (migrate 전용)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Google Cloud Console > Credentials
- `RESORT_CRED_SECRET` — 32B base64 (AES-256 키)
- `CRON_SECRET` — Cron 보호용 임의 문자열

Phase C 이후:
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Inngest 대시보드에서 발급
- `CHROMIUM_PACK_URL` — `@sparticuz/chromium-min` 버전과 일치하는 tarball URL

## 화이트리스트 추가

`prisma/seed.ts`에 이메일 추가 후 `npm run db:seed` 재실행, 또는 Neon SQL 콘솔에서 직접:
```sql
INSERT INTO allowed_emails (id, email, created_at) VALUES (gen_random_uuid(), 'user@skshieldus.com', now());
```

## 디자인 메모

- 본 프로젝트는 형제 프로젝트 `pianoflow`의 스택/스타일과 동일하게 맞춰져 있다.
- shadcn `base-nova` 스타일은 base-ui를 사용하며 일반 shadcn(radix)의 `asChild` 대신 `render` prop을 사용한다.
- Prisma 생성 클라이언트는 `src/generated/prisma/`에 출력되며 git 무시.
