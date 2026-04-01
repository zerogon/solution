# Databricks Event Personal Scheduler - 작업 계획

## 개요
Databricks 행사 참가자가 시간대별 세션을 선택하여 개인 스케줄을 구성하는 모바일 우선 웹 서비스

**기술 스택**: Next.js (App Router) + shadcn/ui + TailwindCSS + lucide-react + LocalStorage

---

## Phase 1: 프로젝트 초기 설정

- [ ] Next.js App Router 프로젝트 생성 (TypeScript, TailwindCSS, src/ 디렉토리)
- [ ] shadcn/ui 초기화 및 컴포넌트 설치 (Card, Badge, Button, Sheet)
- [ ] lucide-react 설치
- [ ] 환경변수 설정 (`NEXT_PUBLIC_EVENT_NAME`)

> **Checkpoint 1**: `npm run dev`로 기본 페이지 정상 렌더링 확인

---

## Phase 2: 데이터 모델 및 세션 데이터

- [ ] TypeScript 타입 정의 (`src/types/agenda.ts`)
  - `Session`: id, time, track, title, speaker
  - `TimeSlot`: time, sessions[]
  - `UserSchedule`: Record<time, sessionId>
- [ ] 세션 데이터 파일 생성 (`src/data/sessions.ts`)
  - PRD 기준 27개 세션 데이터 입력
  - 시간대별 그룹핑 유틸리티 함수

> **Checkpoint 2**: 데이터 import 후 시간대별 세션 목록 정상 출력 확인

---

## Phase 3: 핵심 컴포넌트 구현

- [ ] `TrackBadge` - 트랙 번호 뱃지 (트랙별 색상 구분)
- [ ] `AgendaCard` - 세션 카드
  - 제목, 발표자, 트랙뱃지 표시
  - 선택 시: Primary color highlight + Check 아이콘
  - 미선택 시: 기본 Card 스타일
- [ ] `AgendaTimeline` - 시간대별 카드 목록
  - 같은 시간대 3개 트랙 카드 표시
  - 시간대 헤더 포함
- [ ] `ScheduleList` - 선택 세션 시간순 정렬 목록
- [ ] `ScheduleButton` - 플로팅 "My Schedule" 버튼

> **Checkpoint 3**: 메인 페이지에서 시간대별 세션 카드 정상 렌더링 확인

---

## Phase 4: 상태 관리 및 LocalStorage 연동

- [ ] 스케줄 상태 관리 구현 (`useSchedule` 커스텀 훅)
  - 같은 시간대 하나만 선택 가능 (라디오 동작)
  - 다른 시간대 중복 선택 가능
  - 선택/해제 토글
- [ ] LocalStorage 연동
  - 페이지 새로고침 시 선택 상태 유지
  - SSR hydration mismatch 방지 처리

> **Checkpoint 4**: 세션 선택 → 새로고침 → 선택 상태 유지 확인

---

## Phase 5: 페이지 구성

- [ ] `/` 메인 페이지 - AgendaTimeline + ScheduleButton
- [ ] `/schedule` 페이지 - ScheduleList + 편집 기능
  - 선택 취소 가능
  - 시간순 정렬
  - 빈 상태 안내 메시지

> **Checkpoint 5**: 메인 ↔ 스케줄 페이지 이동 및 데이터 동기화 확인

---

## Phase 6: UI/UX 마무리

- [ ] 모바일 우선 반응형 디자인 적용 (기준: 375px)
- [ ] 세션 선택 시 애니메이션/트랜지션 (100ms 이내 반응)
- [ ] 휴식시간 세션 특별 표시 (선택 불가 처리)
- [ ] Header 디자인 (Databricks Event Scheduler)
- [ ] 전체 색상 테마 및 타이포그래피 정리

> **Checkpoint 6**: 모바일 뷰포트에서 전체 플로우 테스트 완료

---

## 최종 검증

- [ ] `npm run build` 성공
- [ ] 전체 플로우: 시간표 조회 → 세션 선택 → 스케줄 확인
- [ ] 같은 시간대 중복 선택 불가 검증
- [ ] LocalStorage 영속성 (새로고침, 탭 재접속)
- [ ] 모바일 기준 페이지 로딩 2초 이내
