@AGENTS.md

# Welfare Stay — Agent Notes

## 프로젝트 컨텍스트

사내 복지 담당자 1인용 제휴 리조트 통합 조회 시스템. 6개 리조트(롯데·소노캄·한화·대명·켄싱턴·현대) 중 MVP는 **롯데리조트 1개만** 구현하고, 나머지는 selector/config 등록만으로 확장 가능한 구조를 유지한다.

전체 설계: `prd.md` + `/home/zerogon/.claude/plans/humble-shimmying-spindle.md`.

## 스택 / 핵심 결정

- Next.js 16 + React 19 + Tailwind v4 + shadcn v4 (`base-nova` 스타일, base-ui 기반)
- Prisma 7 + Neon PostgreSQL (`@prisma/adapter-pg`, pooler + direct URL)
- NextAuth v5 + Google OAuth + DB 이메일 화이트리스트
- Playwright + `@sparticuz/chromium-min` (Vercel Functions 내부 실행)
- Vercel Cron → Inngest fan-out → 리조트별 함수 (Hobby 60초 제약은 Inngest step 분할로 우회)
- 자격증명: AES-256-GCM 암호화 (`src/lib/crypto.ts`), 마스킹 + 감사 로그

## 코드 스타일 주의

- **`base-nova` shadcn 컴포넌트는 `asChild` 미지원.** Trigger 등에서 `render={<Button />}` 패턴 사용 (예: `src/components/ui/dialog.tsx`).
- **`Select` `onValueChange` 시그니처는 `(value: string | null) => void`** — null 가드 필요.
- **PrismaClient는 adapter 인자 필수** (Prisma 7 + `prisma-client` generator). seed/script도 동일.
- Prisma 생성물은 `src/generated/prisma/`. import 경로 `@/generated/prisma/client` 또는 `@/generated/prisma/enums`.
- Next 16 미들웨어 파일명은 **`src/proxy.ts`** (`middleware.ts` 아님).

## 보안 규칙 (감사 사항)

1. `ResortAccount.idEncrypted` / `pwEncrypted`는 절대 클라이언트로 평문 전달 금지 — `/api/admin/accounts/[id]/reveal`의 응답만이 유일한 합법 경로.
2. 복호화하는 모든 경로는 동일 호출에서 `writeAudit({ action: REVEAL_CREDENTIAL, ... })` 작성 필수.
3. `RESORT_CRED_SECRET`이 32바이트(base64 decode 후)가 아니면 `crypto.ts`가 에러를 던지도록 검증.
4. `/api/cron/*`, `/api/inngest/*` 외 모든 라우트는 `proxy.ts`에서 세션 검증.

## 페이즈 진행 메모

- **Phase A (완료)**: 스캐폴드 / 인증 / 암호화 / 관리 UI / PWA 골격
- **Phase B (다음)**: `src/crawlers/_shared/` + `src/crawlers/lotte/` 구현. 시작 전 사용자에게 롯데 URL/셀렉터 확보 절차 확인.
- **Phase C**: Inngest 함수 + Vercel Cron 배선
- **Phase D**: 검색 UI (React Query + `/api/search`)
- **Phase E**: PWA 폴리시 + 실제 아이콘 자산
- **Phase F**: 나머지 5개 리조트 확장

## 미해결 사항

- 롯데리조트 실제 URL/DOM 셀렉터 — Phase B 시작 전 `npx playwright codegen`으로 캡처 필요
- 검색 단위(단일 체크인-체크아웃 vs 캘린더 그리드) — Phase B 로컬 측정 후 결정
- 실제 PWA 아이콘 — `public/icons/README.md` 참조
