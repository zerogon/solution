# Character Notebook - 프로젝트 구현 계획서

> 소설/웹소설 작가를 위한 작품별 캐릭터 관리 서비스

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Database | Neon Serverless PostgreSQL |
| ORM | Prisma |
| Image Storage | Vercel Blob |
| Styling | Tailwind CSS |
| Hosting | Vercel |

---

## 디렉토리 구조

```
src/
  app/
    page.tsx                          # 작품 목록 (메인)
    layout.tsx                        # 글로벌 레이아웃
    work/[workId]/
      page.tsx                        # 캐릭터 목록
      character/new/page.tsx          # 캐릭터 생성
      character/[characterId]/
        page.tsx                      # 캐릭터 상세
        edit/page.tsx                 # 캐릭터 수정
    api/
      work/route.ts                   # 작품 CRUD
      character/route.ts              # 캐릭터 생성/목록
      character/[id]/route.ts         # 캐릭터 상세/수정/삭제
      folder/route.ts                 # 폴더 CRUD
      folder/[id]/route.ts            # 폴더 삭제/수정
      folder/add-character/route.ts   # 폴더-캐릭터 연결
      upload/route.ts                 # 이미지 업로드
  components/                         # 공통 컴포넌트
  lib/
    prisma.ts                         # Prisma 클라이언트 싱글톤
  types/                              # 타입 정의
prisma/
  schema.prisma                       # DB 스키마
```

---

## Phase 1: 프로젝트 초기화 및 개발 환경 구성

### 작업 항목

- Next.js 프로젝트 생성 (TypeScript, Tailwind CSS, ESLint, App Router, src 디렉토리)
- Prisma 설치 및 초기화 (`prisma`, `@prisma/client`)
- Vercel Blob 패키지 설치 (`@vercel/blob`)
- `.env` 파일 생성 (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`)
- `.env.example` 파일 생성 (환경변수 템플릿)
- `.gitignore`에 `.env` 포함 확인
- 위 디렉토리 구조에 따른 폴더/파일 스캐폴딩

### 검증 체크포인트

- [ ] `npm run dev`로 로컬 서버 정상 기동
- [ ] Neon DB 연결 문자열이 `.env`에 설정됨
- [ ] `npx prisma db push` 실행 시 에러 없음
- [ ] 디렉토리 구조가 계획대로 생성됨

---

## Phase 2: 데이터베이스 스키마 설계 및 마이그레이션

### 작업 항목

- `prisma/schema.prisma`에 4개 모델 정의:
  - **Work**: id(UUID), title, createdAt
  - **Character**: id(UUID), workId(FK), name, role, gender, birthday, age, height, weight, hairColor, hairStyle, eyeColor, personality, features, region, affiliation, foreshadowing, death, notes, imageUrl, createdAt, updatedAt
  - **Folder**: id(UUID), workId(FK), name
  - **FolderCharacter**: folderId(FK), characterId(FK) — 복합키
- 관계 설정:
  - Work 1:N Character
  - Work 1:N Folder
  - Folder M:N Character (FolderCharacter 경유)
- `onDelete: Cascade` 설정 (Work 삭제 시 하위 데이터 자동 삭제)
- Prisma 클라이언트 싱글톤 생성 (`src/lib/prisma.ts`)
- 마이그레이션 실행 (`npx prisma migrate dev --name init`)

### 검증 체크포인트

- [ ] Neon DB에 테이블 4개 정상 생성
- [ ] `npx prisma studio`로 테이블 구조 및 관계 확인
- [ ] Prisma Client 타입 자동완성 동작 확인
- [ ] Cascade 삭제 동작 확인

---

## Phase 3: API 구현 — 작품(Work) 및 캐릭터(Character) CRUD

### 작업 항목

**작품 API** (`/api/work`)
- `POST /api/work` — 작품 생성 (body: `{ title }`)
- `GET /api/work` — 작품 목록 조회 (캐릭터 수 포함)

**캐릭터 API** (`/api/character`)
- `POST /api/character` — 캐릭터 생성 (body: 전체 필드, workId 필수)
- `GET /api/character?workId=xxx` — 작품별 캐릭터 목록 조회
  - 쿼리 파라미터: `search`, `sort`, `order`, `folderId`
  - 검색 대상: name, personality, features, affiliation, region, notes
  - 정렬 기준: name, age, gender (asc/desc)

**캐릭터 상세 API** (`/api/character/[id]`)
- `GET /api/character/{id}` — 캐릭터 상세 조회
- `PATCH /api/character/{id}` — 캐릭터 수정
- `DELETE /api/character/{id}` — 캐릭터 삭제

**이미지 업로드 API** (`/api/upload`)
- `POST /api/upload` — Vercel Blob 이미지 업로드
- 파일 크기 제한 (5MB), 이미지 타입 검증 (jpeg, png, webp)

**공통**
- 입력값 검증 (필수 필드 누락 시 400)
- 존재하지 않는 리소스 요청 시 404
- try-catch 에러 핸들링

### 검증 체크포인트

- [ ] 작품 생성 → 캐릭터 생성 → 조회 → 수정 → 삭제 플로우 정상 동작
- [ ] 검색 쿼리 (`?search=검은머리`) 시 해당 캐릭터만 반환
- [ ] 정렬 쿼리 (`?sort=name&order=asc`) 시 올바른 순서 반환
- [ ] 이미지 업로드 후 URL 정상 반환
- [ ] 잘못된 입력값에 대해 400 에러 반환

---

## Phase 4: API 구현 — 폴더(Folder) 관리

### 작업 항목

**폴더 API** (`/api/folder`)
- `POST /api/folder` — 폴더 생성 (body: `{ workId, name }`)
- `GET /api/folder?workId=xxx` — 작품별 폴더 목록 조회 (캐릭터 수 포함)
- `DELETE /api/folder/{id}` — 폴더 삭제
- `PATCH /api/folder/{id}` — 폴더 이름 수정

**폴더-캐릭터 연결 API** (`/api/folder/add-character`)
- `POST /api/folder/add-character` — 캐릭터를 폴더에 추가 (body: `{ folderId, characterIds[] }`)
  - 복수 선택 가능 (PRD 요구사항)
  - 중복 연결 무시 (`skipDuplicates`)
- `DELETE /api/folder/add-character` — 폴더에서 캐릭터 제거

**캐릭터 목록 API 수정**
- `folderId` 쿼리 파라미터로 폴더 필터 추가

### 검증 체크포인트

- [ ] 폴더 생성/조회/수정/삭제 정상 동작
- [ ] 캐릭터 복수 선택하여 폴더에 추가 정상 동작
- [ ] 동일 캐릭터 중복 추가 시 에러 없이 처리
- [ ] 폴더 필터로 캐릭터 목록 조회 시 해당 캐릭터만 반환
- [ ] 폴더 삭제 시 FolderCharacter 연결도 자동 삭제

---

## Phase 5: UI 구현 — 작품 관리 및 레이아웃

### 작업 항목

**글로벌 레이아웃** (`layout.tsx`)
- 메타데이터 설정 (title: "Character Notebook")
- Tailwind CSS 기본 스타일
- 한글 폰트 설정 (Noto Sans KR)

**메인 페이지 — 작품 목록** (`page.tsx`)
- 작품 카드 그리드 표시 (작품명, 캐릭터 수, 생성일)
- "작품 추가" 버튼 → 모달로 작품명 입력
- 작품 클릭 시 `/work/[workId]`로 이동
- 빈 상태(empty state) UI

**공통 컴포넌트**
- Button, Modal, Input, Card, EmptyState

**데이터 패칭 방식**
- Server Component: 초기 로드 (작품 목록 등)
- Client Component + fetch: 동적 인터랙션 (검색, 정렬)

### 검증 체크포인트

- [ ] 메인 페이지에서 작품 목록 정상 표시
- [ ] 작품 추가 후 목록에 즉시 반영
- [ ] 작품 클릭 시 캐릭터 목록 페이지로 이동
- [ ] 빈 상태 UI 정상 표시
- [ ] 반응형 레이아웃 (모바일/태블릿/데스크톱)

---

## Phase 6: UI 구현 — 캐릭터 목록 및 상세 페이지

### 작업 항목

**캐릭터 목록 페이지** (`work/[workId]/page.tsx`)
- 상단: 작품명, 뒤로가기 버튼
- 상단 영역: 검색창 (debounce 300ms), 정렬 드롭다운
- 좌상단: 폴더 사이드바 토글 버튼
- 중앙: 캐릭터 그리드 (이미지 썸네일 + 이름)
- 하단: "캐릭터 추가" 플로팅 버튼
- 캐릭터 클릭 시 상세 페이지로 이동
- URL 쿼리 파라미터로 상태 관리 (`useSearchParams`)

**캐릭터 상세 페이지** (`character/[characterId]/page.tsx`)
- PRD 섹션 4.5 기준 섹션 구분:
  - 상단: 이미지, 이름, 배역
  - 기본 정보: 성별, 생일, 나이, 키, 체중
  - 외형: 머리색, 헤어스타일, 눈색
  - 설정: 성격, 특징, 지역, 소속
  - 스토리: 복선, 사망
  - 기타: 비고
- 수정/삭제 버튼

**이미지 처리**
- `next/image` 사용, 플레이스홀더 처리
- `next.config.js`에 Vercel Blob 도메인 추가

### 검증 체크포인트

- [ ] 해당 작품의 캐릭터만 표시
- [ ] 상세 페이지에서 모든 필드 정상 표시
- [ ] 이미지 있는/없는 캐릭터 모두 정상 렌더링
- [ ] 수정/삭제 버튼 정상 동작
- [ ] 검색창 입력 시 실시간 필터링

---

## Phase 7: UI 구현 — 캐릭터 생성/수정 폼

### 작업 항목

**캐릭터 생성 페이지** (`character/new/page.tsx`)
- 이미지 업로드 영역 (드래그앤드롭 또는 클릭)
  - `/api/upload` 호출 후 미리보기 표시
- PRD 항목별 입력 필드:
  - 텍스트: 이름, 배역, 성별, 머리색, 헤어스타일, 눈색, 지역, 소속, 사망
  - 숫자: 나이, 키, 체중
  - 날짜: 생일
  - 서술형(textarea): 성격, 특징, 복선, 비고
- 작품명 자동 연결 (workId)
- 필수 필드: 이름만 필수, 나머지 선택
- 제출 시 상세 페이지로 이동

**캐릭터 수정 페이지** (`character/[characterId]/edit/page.tsx`)
- 생성 폼과 동일 레이아웃, 기존 데이터 프리필
- 이미지 변경 가능

**공통 폼 컴포넌트** (`CharacterForm.tsx`)
- 생성/수정 페이지 공유
- props: `initialData?`, `workId`, `onSubmit`

### 검증 체크포인트

- [ ] 캐릭터 생성 시 모든 필드 정상 저장
- [ ] 이미지 업로드 후 미리보기 및 저장 정상
- [ ] 수정 시 기존 데이터 폼에 프리필
- [ ] 이름 미입력 시 제출 불가 (클라이언트 검증)
- [ ] 서술형 필드에 긴 텍스트 입력 정상

---

## Phase 8: UI 구현 — 검색, 정렬, 폴더 필터

### 작업 항목

**검색 기능**
- 캐릭터 목록 상단 검색창
- debounce 적용 (300ms)
- URL 쿼리 파라미터 `?search=xxx`
- 검색 결과 없을 때 안내 메시지
- 검색어 초기화(X) 버튼

**정렬 기능**
- 드롭다운: 정렬 기준 (이름/나이/성별) + 방향 (오름차순/내림차순)
- URL 쿼리 파라미터 `?sort=name&order=asc`
- 기본 정렬: 이름 오름차순

**폴더 사이드바**
- 좌측 사이드바 (토글)
- 폴더 목록 (폴더명 + 캐릭터 수)
- "전체" 옵션 (필터 해제)
- 폴더 추가 버튼 → 모달로 이름 입력
- 폴더 클릭 시 `?folderId=xxx` 설정
- 폴더 삭제 버튼

**폴더에 캐릭터 추가**
- 폴더 선택 상태에서 "캐릭터 추가" 버튼
- 전체 캐릭터 목록 모달 (체크박스 복수 선택)
- 확인 시 API 호출

### 검증 체크포인트

- [ ] 검색 입력 시 실시간 필터링 정상 동작
- [ ] "검은 머리" 검색 시 해당 특징 포함 캐릭터 반환
- [ ] 정렬 변경 시 목록 순서 즉시 변경
- [ ] 폴더 선택 시 해당 폴더 캐릭터만 표시
- [ ] 폴더에 캐릭터 추가/제거 정상 동작
- [ ] 검색 + 정렬 + 폴더 필터 동시 사용 가능

---

## Phase 9: 마무리 및 배포

### 작업 항목

**UX 개선**
- 로딩 상태 표시 (Skeleton UI / Spinner)
- 에러 상태 처리 (에러 바운더리, toast 알림)
- `loading.tsx`, `error.tsx` 각 라우트에 추가

**성능 최적화**
- `next/image` sizes 속성 설정
- API 응답 캐싱 전략 (revalidate)

**배포 설정**
- Vercel 프로젝트 생성 및 Git 연결
- 환경변수 설정: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`
- `next.config.js`에 Vercel Blob 이미지 도메인 설정
- `package.json`에 `"postinstall": "prisma generate"` 추가
- 첫 배포 후 동작 확인

**최종 점검**
- 전체 플로우 테스트: 작품 생성 → 캐릭터 생성(이미지 포함) → 검색/정렬 → 폴더 생성 → 폴더에 캐릭터 추가 → 폴더 필터 조회
- 모바일 반응형 확인
- 에러 시나리오 테스트

### 검증 체크포인트

- [ ] Vercel 배포 성공
- [ ] 배포 환경에서 DB 연결 정상
- [ ] 이미지 업로드/표시 정상
- [ ] 전체 CRUD 플로우 정상 동작
- [ ] 모바일에서 사용 가능

---

## 주요 기술 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 검색 방식 | Prisma `contains` (insensitive) | 개인 작가용 서비스로 데이터 규모가 작아 Full Text Search 불필요 |
| 상태 관리 | URL 쿼리 파라미터 | 새로고침 유지, 공유 가능, 별도 상태 라이브러리 불필요 |
| 이미지 업로드 | 별도 `/api/upload` 엔드포인트 | 캐릭터 CRUD와 분리하여 즉시 미리보기 UX 제공 |
| ID 타입 | UUID (String) | 순차 정수 ID 노출 방지 |
| 폼 처리 | 네이티브 form + useState | 복잡한 검증 없어 외부 라이브러리 불필요 |
