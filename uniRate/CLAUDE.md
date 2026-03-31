# 대학 입시 경쟁률 조회 서비스 (UniRate)

## 프로젝트 개요
대한민국 전국 대학교 특정 학과의 연도별 입시 경쟁률을 조회·비교할 수 있는 웹 서비스

## 기술 스택
- **Runtime**: Node.js 20+
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: SQLite (via better-sqlite3)
- **ORM**: Drizzle ORM
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **Charts**: Recharts
- **Scraping**: Playwright (대학알리미 크롤링용)
- **Package Manager**: pnpm

## 디렉토리 구조 (각 teammate 담당 영역)
```
src/
├── db/              ← db-architect 담당
│   ├── schema.ts       # Drizzle 스키마
│   ├── migrations/     # 마이그레이션 파일
│   ├── seed.ts         # 시드 데이터
│   └── index.ts        # DB 연결 설정
├── etl/             ← etl-engineer 담당
│   ├── scraper.ts      # 크롤러 메인 로직
│   ├── parser.ts       # HTML 파싱/데이터 정제
│   ├── normalizer.ts   # 대학명/학과명 표준화
│   └── scheduler.ts    # 스케줄링 로직
├── app/
│   ├── page.tsx        # 메인 페이지 ← frontend-dev
│   ├── layout.tsx      # 루트 레이아웃 ← frontend-dev
│   ├── search/         # 검색 페이지 ← frontend-dev
│   ├── compare/        # 비교 페이지 ← frontend-dev
│   ├── university/[id] # 대학 상세 ← frontend-dev
│   └── api/            ← backend-dev 담당
│       ├── universities/route.ts
│       ├── departments/route.ts
│       ├── rates/route.ts
│       └── compare/route.ts
└── components/      ← frontend-dev 담당
    ├── SearchBar.tsx
    ├── RateChart.tsx
    └── CompareTable.tsx
```

## 데이터 모델
- **universities**: id, name, region, type(국립/사립)
- **departments**: id, universityId, name, category(계열)
- **admission_types**: id, name(수시/정시/편입 등)
- **competition_rates**: id, departmentId, admissionTypeId, year, applicants, accepted, rate

## 코딩 규칙
- 한국어 주석 사용
- 함수/변수명은 camelCase (영문)
- 파일명은 kebab-case 또는 PascalCase (컴포넌트)
- API 응답은 JSON, 영문 key
- 각 teammate는 자신의 담당 디렉토리만 수정할 것
- 다른 teammate 디렉토리의 파일을 수정하지 말 것

## teammate 간 소통 규칙
- 스키마 변경 시 db-architect → backend-dev에게 SendMessage
- API 스펙 확정 시 backend-dev → frontend-dev에게 SendMessage
- 데이터 구조 확정 시 etl-engineer → db-architect에게 SendMessage
- 작업 완료 시 TaskUpdate로 태스크 상태 업데이트
