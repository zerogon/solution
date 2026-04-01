# PRD

Databricks Event Personal Scheduler

## 1. 제품 개요

Databricks 행사에서는 동일 시간대에 여러 개의 트랙이 동시에 진행된다.
참가자는 자신이 원하는 세션을 선택하여 개인 맞춤형 스케줄을 구성할 필요가 있다.

본 서비스는 행사 참가자가 **시간대별 아젠다를 확인하고 선택하여 개인 스케줄을 구성할 수 있도록 하는 웹 서비스**이다.

사용자는 별도의 회원가입 없이 간단히 세션을 선택하여 **나만의 행사 스케줄을 생성**할 수 있다.

서비스는 행사 참여자가 **현장에서 모바일로 빠르게 사용할 수 있도록 직관적이고 빠른 UI**를 목표로 한다.

---

# 2. 목표

### 핵심 목표

사용자가 행사 시작 전에 또는 현장에서 **빠르게 자신의 참여 세션을 계획할 수 있도록 지원**

### 성공 지표

* 사용자 스케줄 생성 완료율
* 평균 세션 선택 수
* 페이지 로딩 속도 (모바일 기준 2초 이하)
* QR 또는 링크 접속 후 10초 내 첫 선택 완료

---

# 3. 사용자 시나리오

### 시나리오 1

1. 사용자는 행사 페이지에 접속한다
2. 1시부터 6시까지 시간표를 확인한다
3. 동일 시간대에 있는 3개의 트랙 중 하나를 선택한다
4. 선택한 세션이 개인 스케줄에 추가된다
5. 모든 시간대 선택 후 자신의 일정표를 확인한다

### 시나리오 2

1. 사용자는 일부 시간대만 선택한다
2. 나중에 다시 접속하여 수정한다

---

# 4. 핵심 기능

## 4.1 아젠다 시간표 조회

사용자는 전체 행사 시간표를 확인할 수 있다.

### 구성

시간대별 카드 UI

예

```
13:00 - 13:30

Track 1
카카오스타일 Databricks 도입기

Track 2
...

Track 3
...
```

### 요구사항

* 각 시간대에 3개의 세션 표시
* 세션 제목
* 발표자
* 트랙 번호 표시

---

## 4.2 세션 선택 기능

사용자는 원하는 세션을 선택할 수 있다.

### 동작

* 같은 시간대에서는 **하나만 선택 가능**
* 다른 시간대에서는 **중복 선택 가능**

### UX

선택된 세션은 다음과 같이 표시

* 카드 색상 변경
* 체크 아이콘 표시

---

## 4.3 나의 스케줄 보기

사용자가 선택한 세션을 모아서 보여준다.

### 구성

```
My Schedule

13:00
카카오스타일 Databricks 도입기

13:30
NOL Universe segmentation
```

### 기능

* 시간순 정렬
* 선택 취소 가능

---

## 4.4 스케줄 수정

사용자는 언제든 세션 선택을 변경할 수 있다.

---

# 5. UI / UX 설계

## UI 원칙

* 모바일 우선 디자인
* 최소 클릭
* 직관적인 카드 선택 방식

---

## 메인 화면 구조

```
Header
Databricks Event Scheduler

Timeline

13:00

[Track1 Card]
[Track2 Card]
[Track3 Card]

13:30

[Track1 Card]
[Track2 Card]
[Track3 Card]

Floating Button
View My Schedule
```

---

## 세션 카드 디자인

shadcn Card 컴포넌트 활용

포함 정보

```
Track Badge

Session Title

Speaker Name
```

선택 시

```
Primary color highlight
Check icon
```

---

## My Schedule 페이지

```
My Schedule

13:00
Session Title

13:30
Session Title

Edit Schedule
```

---

# 6. 기술 스택

### Frontend

Framework

Next.js (App Router)

UI

shadcn/ui

Styling

TailwindCSS

Icons

lucide-react

State Management

React state or Zustand

---

### Backend

필수 기능이 단순하기 때문에 **서버 없이도 구현 가능**

옵션 1 (추천)

Local Storage 사용

이유

* 로그인 없음
* 개인 일정만 관리
* 빠른 구현

---

옵션 2

Neon Postgres 사용

필요한 경우

* 사용자 통계
* 선택된 세션 수 분석
* QR 이벤트 분석

---

# 7. 데이터 모델

## Agenda

```
agenda

id
time
track
title
speaker
```

---

## User Schedule (optional)

Neon 사용 시

```
schedule

id
session_id
created_at
user_id (optional)
```

---

# 8. 페이지 구조

```
/
메인 시간표

/schedule
나의 스케줄
```

---

# 9. 주요 컴포넌트

```
components

AgendaTimeline
AgendaCard
TrackBadge
ScheduleList
ScheduleButton
```

---

# 10. 배포 구조

Hosting

Vercel

구성

```
Next.js App Router

Edge optimized
```

환경

```
NEXT_PUBLIC_EVENT_NAME
```

---

# 11. 성능 요구사항

모바일 기준

페이지 로딩

< 2초

세션 선택 반응

< 100ms

---

## 인기 세션 분석

어떤 세션이 가장 많이 선택됐는지 분석


---

# 13. MVP 범위

MVP에는 다음 기능만 포함

* 시간표 조회
* 세션 선택
* 개인 스케줄 보기
* 세션 수정

---

# 세션 데이터

| 시간      | 트랙   | 아젠다                                                                  | 발표자                                                                                                            |
| ------- | ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 오후 1:00 | 트랙 1 | 고객사례: 카카오스타일의 Databricks 도입기                                         | 박지윤 - 카카오스타일 Data Engineer                                                                                     |
| 오후 1:30 | 트랙 1 | 고객사례: NOL UNIVERSE의 Databricks로 구현한 셀프서빙 Segmentation 플랫폼            | 김성주 - NOL UNIVERSE 매니저 (Data Scientist)                                                                        |
| 오후 2:00 | 트랙 1 | 고객사례: 무신사의 Genie를 통한 지표 모니터링 자동화 구축기                                 | 장성국 - MUSINSA Data Analyst                                                                                     |
| 오후 2:30 | 트랙 1 | 고객사례: 카페24 PRO - Closed-Loop 멀티 에이전트 기반 AI 워크플로우                     | 장현철 - 카페24 Senior AI Researcher / Engineer<br>이성현 - 카페24 AI Researcher / Engineer                              |
| 오후 3:00 | 트랙 1 | 개발자 세션: Real-time Mode Technical Deep Dive                           | 임정택 - Databricks Staff Software Engineer                                                                       |
| 오후 3:30 | 트랙 1 | 휴식시간 및 네트워킹                                                          | -                                                                                                              |
| 오후 4:00 | 트랙 1 | Analytics 기술 세션: Databricks 마이그레이션, 당신이 알아야 할 모든 것                   | 김지선 - Databricks Korea Sr. Solutions Architect                                                                 |
| 오후 4:35 | 트랙 1 | Analytics 기술 세션: 분석은 SQL처럼, 인사이트는 AI처럼                               | 조유빈 - Databricks Korea Solutions Architect                                                                     |
| 오후 5:10 | 트랙 1 | Analytics 기술 세션: 고성능 Genie 만들기 - 튜닝 전략과 Multi-Agent Supervisor 운영 패턴 | 민지수 - Databricks Korea Sr. Solutions Engineer                                                                  |
| 오후 1:00 | 트랙 2 | 고객사례: TMAP의 Databricks 도입 이후의 진짜 과제                                  | 남궁찬 - TMAP 매니저                                                                                                 |
| 오후 1:30 | 트랙 2 | 고객사례: LG U+의 U+one AI 검색 X Databricks LLM 서비스 도입기                    | 윤형중 - LG U+ 책임<br>조경현 - LG U+ 책임                                                                               |
| 오후 2:00 | 트랙 2 | 스폰서 세션: DATA DYNAMICS 보안 로그 이상탐지 ML모델 및 성능 관리 체계 구축                  | 안지민 - Data Dynamics 대리                                                                                         |
| 오후 2:30 | 트랙 2 | 고객사례: 협동조합의 AI 변신 - 한살림 데이터 분석 여정                                    | 정강우 - 한살림 데이터분석팀 팀장                                                                                            |
| 오후 3:00 | 트랙 2 | 교육세션: Databricks 기반 직무형 데이터 인재 양성 로드맵                                | 이현수 - Databricks Korea Sr. Technical Instructor<br>Victoria Cho - Databricks Sr. Customer Enablement Architect |
| 오후 3:30 | 트랙 2 | 휴식시간 및 네트워킹                                                          | -                                                                                                              |
| 오후 4:00 | 트랙 2 | AI Agent 기술 세션: Databricks + OpenAI Agents SDK 멀티 에이전트 시스템 구축        | 김정훈 - Databricks Korea Sr. Solutions Architect                                                                 |
| 오후 4:35 | 트랙 2 | AI Agent 기술 세션: Databricks Agent Bricks                              | 박혜미 - Databricks Korea Sr. Solutions Architect                                                                 |
| 오후 5:10 | 트랙 2 | AI Agent 기술 세션: Production 환경에서의 AI Agent 성능 평가 전략                   | 지승원 - Databricks Korea Sr. Specialist Solutions Engineer                                                       |
| 오후 1:00 | 트랙 3 | 고객사례: KRAFTON 안티치트를 위한 실시간 ML 가드레일 구축                                | 유민상 - KRAFTON ML Engineer                                                                                      |
| 오후 1:30 | 트랙 3 | 고객사례: DALPHA의 Databricks 기반 AI Native 온톨로지 구축                        | 정연길 - DALPHA Dev Tech Lead                                                                                     |
| 오후 2:00 | 트랙 3 | 고객사례: KCD의 AI 프랜차이즈 사업장 탐지 모델                                        | 박윤진 - 한국신용데이터 데이터 분석팀                                                                                          |
| 오후 2:30 | 트랙 3 | 스폰서 세션: MegazoneCloud SAP Business Data Cloud + Databricks           | 김철민 - MegazoneCloud Unit Leader                                                                                |
| 오후 3:00 | 트랙 3 | 고객사례: LG전자 Data Platform Modernization                               | 이호진 - LG전자 팀장                                                                                                  |
| 오후 3:30 | 트랙 3 | 휴식시간 및 네트워킹                                                          | -                                                                                                              |
| 오후 4:00 | 트랙 3 | Apps 기술 세션: Lakebase - 완전 관리형 Postgres                               | 윤종화 - Databricks Korea Solutions Architect                                                                     |
| 오후 4:35 | 트랙 3 | Apps 기술 세션: Databricks Apps 완전정복                                     | 이정환 - Databricks Korea Sr. Solutions Engineer                                                                  |
| 오후 5:10 | 트랙 3 | Apps 기술 세션: 바이브 코딩으로 Databricks 생산성 10배                              | 전종섭 - Databricks Korea Sr. Specialist Solutions Engineer                                                       |
