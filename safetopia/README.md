# Sulki Holiday — 내 연차 관리

엑셀로 하던 연차 관리를 옮긴 1인용 웹앱(PWA). 연도별로 받은 연차를 적고, 연차·반차를 쓴 날을 기록하면
쉬는 요일(기본 토·일)과 공휴일을 빼고 일수를 계산해 잔여를 보여 준다. 요구사항은 `PRD.md`, 개발 노트는 `AGENTS.md`.

## 시작
```bash
npm install
npm run db:local:up          # Docker Postgres (5434)
npm run db:local:dev         # prisma migrate dev
npm run db:local:seed        # 비밀번호 1234
npm run dev
```

운영 DB에 처음 비밀번호를 만들 때:
```bash
OWNER_PASSWORD='...' OWNER_NAME='이름' npm run owner:set-password -- --yes
```

## 검증
```bash
npm run typecheck && npm run lint && npm test
```
