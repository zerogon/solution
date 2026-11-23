# 다른 Vercel · Neon 계정으로 이전 (런북)

> 2026-11-23 실행 완료. `zerogons-projects/stayhome`(`stayhome-khaki.vercel.app`) + Neon `us-east-1`
> → `zero-81de/stayhome`(`stayhome-one.vercel.app`) + Neon `ap-southeast-1`(PG 18). **Inngest는 계정을 그대로 썼고**
> 앱 `stayhome`(`src/lib/inngest/client.ts`의 `id`)에 `curl -X PUT …/api/inngest` 한 번으로 URL만 옮겼다.
> 다음 이전 때도 같은 순서를 쓰면 된다 — 끝나면 `deploy.md`·`CLAUDE.md`·`README.md`의 도메인 표기를 바꿀 것.

## 실제로 해 보니 (2026-11-23)

- **DB 복사는 `db-transfer.sh`가 아니라 일회성 Node 복사로 했다.** 이 WSL에 pg 클라이언트도 Docker 연동도
  없어서 `prisma db push`로 새 DB에 스키마를 만든 뒤 `json_populate_recordset`로 테이블을 FK 순서대로
  한 트랜잭션에 옮겼다(13테이블 · 재고 42,141행 · 수 초). 옛 DB는 `REPEATABLE READ READ ONLY`로 읽었다.
  · 옛 DB와 새 DB의 **열 순서가 달랐다**(`resort_inventory`의 `synced_at` — 컬럼을 나중에 더한 흔적).
    이름 기준 복사라 무해하지만, `pg_dump`를 쓰지 않고 `COPY`/위치 기준으로 옮기면 값이 엉뚱한 열에 들어간다.
- **새 프로젝트의 첫 배포 둘은 `main` 브랜치였다.** import 직후 Production Branch를 `stayhome`으로 바꿔도
  이미 만든 배포는 그대로이고, "No deployments found for stayhome"이 뜬다. Vercel API로
  `gitSource.ref = "stayhome"` 배포를 만들어 풀었다 — 별칭에 `stayhome-git-stayhome-…`가 있는지로 확인한다.
- **Neon을 Vercel 통합으로 만들면** 대시보드가 `POSTGRES_*` 묶음을 준다. 이 앱이 읽는 것은
  `DATABASE_URL`(pooled)과 `DIRECT_URL`(= `DATABASE_URL_UNPOOLED`) 둘뿐이다.
- **옛 프로젝트는 Cron 설정을 찾는 대신 Pause로 껐다.** 모든 요청이 `503 DEPLOYMENT_PAUSED`라 크론·Inngest 호출이
  함수에 닿지 않는다. 다만 Git 연결이 남아 있으면 push마다 빌드는 돈다.
- 프로덕션 도메인은 Deployment Protection 대상이 아니라서 수동 sync에 bypass 시크릿이 필요 없었다.

## 되돌릴 수 없는 위험은 셋이다

1. **`RESORT_CRED_SECRET`이 DB를 봉인한 키와 다르면** 리조트 계정 6개가 복호화되지 않는다.
   증상은 "모든 리조트 로그인 실패"처럼 보인다. 옛 값은 Vercel에 Sensitive라 되읽을 수 없으므로
   **이전 전에** `scripts/verify-env.ts`로 판정한다(2026-11-23: 로컬 `.env`의 키로 6/6 복호화 OK).
   못 맞추면 새 키로 `/admin/accounts`에서 6개를 다시 등록하는 수밖에 없다.
2. **옛 배포와 새 배포가 동시에 크롤하면** 같은 법인 실계정으로 두 번 로그인한다(잠금 위험).
   Inngest 크론은 sync한 쪽 하나만 돌지만 **Vercel Cron 백스톱(12:00 KST)은 프로젝트마다 따로 돈다.**
   컷오버에서 옛 프로젝트의 크론을 먼저 끈다.
3. **리전.** `vercel.json`의 `regions: ["icn1"]`이 따라가므로 대개 문제없지만, 새 프로젝트 첫 배포 후
   `npx vercel inspect <URL>`이 `[icn1]`인지 확인한다 — 아니면 롯데·한화가 로그인하지 못한다.

## 도구

| 스크립트 | 하는 일 |
| --- | --- |
| `npx tsx scripts/verify-env.ts [--production]` | 필수 env 존재 · 키↔DB 복호화 성공 여부(값은 안 찍음) · 테이블별 행 수. 읽기 전용 |
| `SRC_URL=… DST_URL=… bash scripts/db-transfer.sh` | Neon→Neon `pg_dump -Fc` / `pg_restore --clean --single-transaction`. 로컬 pg 클라이언트 또는 Docker 필요 |
| `bash scripts/push-vercel-env.sh [--dry-run] [--skip-inngest]` | gitignore된 `.env.production`을 링크된 프로젝트에 Sensitive로 일괄 등록(`--force`라 재실행 안전) |

`db-transfer.sh`는 **direct(비 `-pooler`) URL**을 쓴다. 이 머신(WSL)에는 `pg_dump`도 Docker WSL 연동도
없으므로 둘 중 하나를 먼저 준비한다 — `sudo apt install postgresql-client`(서버 메이저 이상, 17이면 PGDG 저장소)
또는 Docker Desktop → Resources → WSL integration. 어느 쪽도 싫으면 새 Neon 콘솔의 **Import data**가
같은 일을 한다(그 뒤 행 수 대조는 `verify-env.ts`로 동일).

## 순서

### A. 사전 점검
1. `npx tsx scripts/verify-env.ts` → 계정 6개 `id=ok pw=ok`. 행 수를 적어 둔다.

### B. Neon (새 계정)
2. 새 프로젝트 생성. 리전은 **AWS ap-southeast-1(싱가포르)** 권장 — 서울·도쿄가 없고, `us-east-1` 대비
   `icn1` 함수와의 쿼리 왕복이 크게 준다. Postgres 메이저는 옛 프로젝트 이상.
3. 09:00·12:00 KST를 피해 `SRC_URL='<옛 direct>' DST_URL='<새 direct>' bash scripts/db-transfer.sh`.
4. `DATABASE_URL='<새 pooled>' DIRECT_URL='<새 direct>' npx tsx scripts/verify-env.ts` → 행 수가 1과 같고 복호화 OK.
   (이전 이후 옛 DB에 쓰인 `crawl_logs`·`resort_inventory`는 버려도 된다 — 다음 수집이 다시 채운다.)

### C. Vercel (새 계정)
5. **Add New → Project → GitHub `zerogon/solution` import**(새 계정에 GitHub 앱 권한 부여 필요).
   - Root Directory: `stayhome`
   - Production Branch: `stayhome` (Settings → Git, import 후 바꿔야 할 수 있다)
   - Framework: Next.js, Build Command 기본값(`npm run build` = `prisma generate && next build`)
   - 다른 브랜치 push는 `vercel.json`의 `ignoreCommand`가 건너뛴다.
   - 첫 빌드는 env가 없어 실패해도 된다.
6. 로컬(이 디렉터리)에서:
   ```bash
   npx vercel logout && npx vercel login     # 새 계정
   npx vercel link                            # 새 프로젝트 선택 → .vercel/project.json 갱신
   cp .env.example .env.production            # 아래 값 채우기
   bash scripts/push-vercel-env.sh --dry-run
   bash scripts/push-vercel-env.sh            # Inngest Vercel 통합을 쓸 거면 --skip-inngest
   ```
   `.env.production`에 넣을 것: 새 Neon `DATABASE_URL`/`DIRECT_URL`, 기존 `.env`의
   `AUTH_SECRET`·**`RESORT_CRED_SECRET`(반드시 동일)**·`CRON_SECRET`·`INNGEST_EVENT_KEY`·`INNGEST_SIGNING_KEY`,
   `AUTH_TRUST_HOST=true`, `CHROMIUM_PACK_URL`(.env.example 값), 있으면 `SLACK_WEBHOOK_URL`.
   `AUTH_URL`은 넣지 않는다(스크립트가 건너뛴다).
   올리기 전 점검: `(set -a; . ./.env.production; set +a; npx tsx scripts/verify-env.ts --production)`
   — 셸 변수가 `.env`보다 우선하므로 `.env.production`의 값으로 검사된다.
7. Settings → Deployment Protection → **Protection Bypass for Automation** 시크릿 생성(Inngest sync용).
   저장소·클라이언트에 두지 않는다.
8. 재배포(`npx vercel --prod` 또는 Deployments → Redeploy). 확인:
   - `npx vercel inspect <새 URL>` 람다가 `[icn1]`
   - 새 URL에서 로그인(기존 `users` 계정 그대로) → 조회 화면에 기존 재고가 보임

### D. 컷오버 — 옛 것을 먼저 끈다
9. **옛 Vercel 프로젝트**: Settings → Cron Jobs → Disable, Settings → Git → Disconnect.
   (Inngest Vercel 통합을 옛 계정에 설치했었다면 거기서도 이 프로젝트 연결을 제거.)
10. **Inngest**(같은 계정): 앱 `stayhome`을 새 URL로 sync.
    - 통합 방식: 새 Vercel 계정에 Inngest 통합 설치 → 새 프로젝트 연결 → 재배포하면 자동 sync.
    - 수동 방식: Apps → `stayhome` → Resync, URL `https://<새 URL>/api/inngest`, bypass 시크릿 입력.
    - 판정: `curl -X PUT https://<새 URL>/api/inngest` → `{"message":"Successfully registered",…}`.
      `signing key is invalid`면 env의 `INNGEST_SIGNING_KEY`가 그 Inngest 환경의 키와 다르다.
11. Inngest 대시보드에 앱이 **하나**(새 URL)이고 `scheduled-refresh`에 크론 트리거가 보이는지.

### E. 검증
12. 조회 화면에서 지점 하나 골라 **최신화**(예: 리솜 지점) → `/admin/crawl-logs`에 SUCCESS.
    브라우저 기동 · 복호화 · 리전 · DB 쓰기가 한 번에 확인된다. 롯데나 한화로 한 번 더 하면 리전까지 확실하다.
13. `curl -H "Authorization: Bearer $CRON_SECRET" "https://<새 URL>/api/cron/refresh?dryRun=1"` → 판단만 반환.
14. 다음날 09:00 KST 뒤 `/admin/crawl-logs`에 6개 리조트가 찍히는지.
15. 확인되면 옛 Vercel 프로젝트 삭제. 옛 Neon은 며칠 보관 후 삭제.
16. 문서의 옛 도메인·팀 이름 갱신(`grep -rn "khaki\|zerogons" CLAUDE.md README.md docs/`).
