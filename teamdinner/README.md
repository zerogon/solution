# teamdinner

팀 회식 메뉴 사전 접수 장바구니. 네이버 지도 링크 하나로 메뉴판을 가져오고, 팀원은 이름만 적고
먹고 싶은 메뉴를 담는다. Next.js 16 · shadcn · Drizzle + Neon · PWA · Vercel.

## 실행

```bash
npm install
docker compose up -d                # 로컬 DB (선택, Neon 없이 개발할 때)
cp .env.example .env.local          # DATABASE_URL (+ 로컬이면 NEON_LOCAL_PROXY)
npm run db:push
npm run dev
```

## 배포 (Vercel)

1. Vercel 프로젝트 생성, Root Directory = `teamdinner`, 리전은 `vercel.json`(icn1).
2. Neon 통합(Storage → Neon)으로 `DATABASE_URL` 주입, 또는 직접 환경변수 추가.
3. 첫 배포 뒤 로컬에서 `DATABASE_URL=<neon url> npm run db:push`로 테이블 생성.
4. 프로덕션 URL에서 네이버 링크로 회식을 만들어 메뉴가 수집되는지 확인.

## 스크립트

| 명령 | 역할 |
|---|---|
| `npm run naver:debug -- <링크>` | 네이버 링크 → 메뉴 파싱 결과 출력 |
| `npm run db:push` | 스키마를 DB에 반영 |
| `npm run icons:generate` | PWA 아이콘 PNG 재생성 |
