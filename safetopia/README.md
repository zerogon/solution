# safetopia — 다지점 카페 연차 관리

직원은 PC/모바일(PWA)에서 잔여 연차를 확인하고 연차·반차를 신청하고, 관리자는 지점별 근무 인원을 보며 승인/반려한다. 요구사항은 `PRD.md`, 개발 노트는 `AGENTS.md`.

## 시작
```bash
npm install
npm run db:local:up          # Docker Postgres (5434)
npm run db:local:dev         # prisma migrate dev
npm run db:local:seed        # admin/admin1234, emp01~08/1234
npm run dev
```

## 검증
```bash
npm run typecheck && npm run lint && npm test && npm run race-test
```
