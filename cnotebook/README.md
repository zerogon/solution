# Character Notebook

소설/웹소설 작가를 위한 **작품별 캐릭터 관리 서비스**입니다.
작품 단위로 캐릭터 정보를 체계적으로 등록하고, 원고 작성 중 빠르게 검색할 수 있습니다.

## 주요 기능

- **작품 관리** - 작품 생성 및 목록 조회
- **캐릭터 CRUD** - 이름, 배역, 외형, 성격, 복선 등 18개 필드 관리
- **이미지 업로드** - 캐릭터 이미지 등록 (Vercel Blob)
- **검색** - 이름, 성격, 특징, 소속, 지역, 비고 필드 키워드 검색
- **정렬** - 이름 / 나이 / 성별 기준 오름차순·내림차순
- **폴더** - 캐릭터 그룹 관리 (주요 인물, 조연, 악역 등)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Neon Serverless PostgreSQL |
| ORM | Prisma 7 |
| Image Storage | Vercel Blob |
| Styling | Tailwind CSS 4 |
| Hosting | Vercel |

## 시작하기

### 사전 요구사항

- Node.js 18+
- PostgreSQL 데이터베이스 (Neon 권장)

### 설치

```bash
git clone <repository-url>
cd cnotebook
npm install
```

### 환경변수 설정

`.env.example`을 `.env`로 복사한 뒤 값을 입력합니다.

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxx"
```

### 데이터베이스 마이그레이션

```bash
npx prisma migrate dev --name init
```

### 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 프로젝트 구조

```
src/
  app/
    page.tsx                          # 작품 목록 (메인)
    layout.tsx                        # 글로벌 레이아웃
    work/[workId]/
      page.tsx                        # 캐릭터 목록 (검색/정렬/폴더)
      character/new/page.tsx          # 캐릭터 생성
      character/[characterId]/
        page.tsx                      # 캐릭터 상세
        edit/page.tsx                 # 캐릭터 수정
    api/
      work/route.ts                   # 작품 API
      character/route.ts              # 캐릭터 생성/목록 API
      character/[id]/route.ts         # 캐릭터 상세/수정/삭제 API
      folder/route.ts                 # 폴더 API
      folder/[id]/route.ts            # 폴더 수정/삭제 API
      folder/add-character/route.ts   # 폴더-캐릭터 연결 API
      upload/route.ts                 # 이미지 업로드 API
  components/
    CharacterForm.tsx                 # 캐릭터 생성/수정 공통 폼
  lib/
    prisma.ts                         # Prisma 클라이언트 싱글톤
prisma/
  schema.prisma                       # DB 스키마
```

## API 엔드포인트

### 작품

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/work` | 작품 목록 조회 |
| POST | `/api/work` | 작품 생성 |

### 캐릭터

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/character?workId=` | 캐릭터 목록 (검색/정렬/폴더 필터) |
| POST | `/api/character` | 캐릭터 생성 |
| GET | `/api/character/:id` | 캐릭터 상세 |
| PATCH | `/api/character/:id` | 캐릭터 수정 |
| DELETE | `/api/character/:id` | 캐릭터 삭제 |

### 폴더

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/folder?workId=` | 폴더 목록 조회 |
| POST | `/api/folder` | 폴더 생성 |
| PATCH | `/api/folder/:id` | 폴더 이름 수정 |
| DELETE | `/api/folder/:id` | 폴더 삭제 |
| POST | `/api/folder/add-character` | 폴더에 캐릭터 추가 |
| DELETE | `/api/folder/add-character` | 폴더에서 캐릭터 제거 |

### 이미지

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/upload` | 이미지 업로드 (5MB, JPG/PNG/WebP) |

## 배포

Vercel에 배포 시 다음 환경변수를 설정합니다:

- `DATABASE_URL` - Neon PostgreSQL 연결 문자열
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob 토큰

```bash
vercel deploy
```

## 라이선스

ISC
