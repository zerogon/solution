
```markdown
# 다지점 카페 연차 관리 시스템 요구사항 정의서 (v1.1)

**문서 버전:** v1.1  
**작성일:** 2026-09-04  
**목적:** 다지점 카페 직원의 연차/반차 신청 및 관리 시스템 구축  

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목적
여러 지점의 카페를 운영하는 관리자가 직원들의 연차 및 반차 사용 현황을 효율적으로 관리할 수 있도록 웹 기반 연차 관리 시스템을 구축한다.  
직원은 PC 또는 모바일에서 자신의 연차 잔여일수를 확인하고 연차/반차를 신청할 수 있으며, 관리자는 직원별 연차 현황과 지점별 근무 인원을 확인하고 연차 신청을 승인/반려할 수 있도록 한다.

### 1.2 프로젝트 범위

#### 포함 범위
* 사용자 로그인 / 인증
* 직원 관리 (등록, 수정, 비활성화)
* 관리자 관리
* 지점 관리 (등록, 수정, Soft Delete)
* 연차 / 반차 관리 및 부여 / 조정
* 연차 신청 및 승인 / 반려 / 취소
* 잔여 연차 및 사용 내역 조회
* 지점별 직원 및 근무 인원 현황 조회
* 모바일 / PWA 지원
* 관리자 및 직원 대시보드
* 연차 사용 현황 캘린더 (지점별 필터)
* 인앱 알림 및 웹 푸시

#### 제외 범위
* 급여 관리 및 급여명세서
* 출퇴근 기록 및 근태 상세 관리
* 4대 보험 관리
* 인사평가
* 전자결재
* 다수 기업을 지원하는 SaaS (Multi-tenancy) 기능

---

## 2. 사용자 정의 (최대 20명 이하)

### 2.1 관리자 (ADMIN)
카페 전체 지점과 직원을 관리하는 사용자.
* **주요 권한:**
  * 지점 등록 / 수정 / 비활성화
  * 직원 등록 / 수정 / 비활성화
  * 직원의 소속 지점 변경
  * 직원의 연차 부여 / 수정 / 조정
  * 연차 신청 승인 / 반려
  * 전체 직원 및 지점별 연차 현황 조회
  * 전체 캘린더 조회 및 감사 로그(Audit Log) 확인

### 2.2 직원 (EMPLOYEE)
자신의 연차를 조회하고 연차/반차를 신청하는 사용자.
* **주요 권한:**
  * 자신의 연차 잔여일수 및 사용 이력 조회
  * 연차 및 반차 신청
  * 신청 취소 (승인 전 대기 상태일 때만 가능)
  * 승인된 연차 내역 및 개인 캘린더 확인
  * 자신의 기본 정보 확인

---

## 3. 핵심 업무 흐름

### 3.1 직원 연차 신청 흐름

```

[직원 로그인]
↓
[대시보드 - 잔여 연차 확인]
↓
[연차 신청 페이지]
↓
[사용 날짜 및 유형(연차/오전반차/오후반차) 선택]
↓
[사유 입력 및 신청]
↓
[서버/DB 중복 및 잔여일수 검증]
↓
[관리자 승인 대기 (PENDING)]
↓
[관리자 승인]
↓
[연차 사용 확정 (APPROVED) & 잔여 연차 차감]

```

### 3.2 관리자 승인 흐름

```

[관리자 로그인]
↓
[대시보드 / 알림 - 대기 중인 신청 확인]
↓
[신청 상세 내용 및 해당 지점 근무 예상 인원 확인]
↓
[승인(APPROVED) 또는 반려(REJECTED)]

* 반려 시 반려 사유 필수 입력
↓
[직원에게 상태 반영 및 알림 발송]

```

---

## 4. 연차 정책

### 4.1 연차 단위
| 휴가 유형 | 차감 단위 | 설명 |
| :--- | :--- | :--- |
| **연차** | 1.0일 | 하루 전체 휴가 |
| **오전 반차** | 0.5일 | 오전 근무 시간대 휴가 |
| **오후 반차** | 0.5일 | 오후 근무 시간대 휴가 |

* **휴무일 / 공휴일 처리:** 연차 신청 시 지점의 고정 휴무일 및 법정 공휴일은 사용 일수(`days`) 계산에서 자동 제외된다.
* 향후 필요시 1시간 단위 휴가 등으로 확장할 수 있으나 초기 버전에서는 지원하지 않는다.

### 4.2 연차 잔여일수 계산 및 관리
* **총 보유 연차** = 기본 부여 연차(`totalDays`) + 이월 연차(`carriedOverDays`) + 관리자 조정 연차(`adjustedDays`)
* **실제 잔여 연차** = 총 보유 연차 - 승인 완료된 사용 연차(`usedDays`)
* **신청 가능 연차** = 실제 잔여 연차 - 승인 대기 중인 연차(`pendingDays`)

#### 중복 신청 및 예약 정책
* 동일 날짜에 승인 대기(`PENDING`) 및 승인(`APPROVED`) 건이 존재하는 경우 추가 신청을 차단한다.
* 승인 대기 상태에서도 해당 날짜는 예약 상태로 취급하여 동일 직원의 중복 신청을 방지한다.

---

## 5. 기능 요구사항

### FR-001 로그인 및 인증
* 이메일 또는 아이디 기반 로그인 / 비밀번호 로그인
* 로그아웃 / 로그인 상태 유지 (세션 기반)
* 비밀번호 변경
* 비활성(`INACTIVE`, `RETIRED`) 사용자 로그인 차단
* 서버 사이드 권한 검증 (API 및 페이지 접근 제한)

### FR-002 직원 관리
* 관리자는 직원 정보를 등록 / 수정 / 비활성화할 수 있다.
* **직원 정보:** 이름, 이메일, 연락처, 소속 지점, 입사일, 연차 총량, 사용자 권한(ADMIN/EMPLOYEE), 재직 상태.
* **재직 상태:** 재직(`ACTIVE`), 휴직(`INACTIVE`), 퇴사(`RETIRED`).
* 퇴사한 직원의 데이터는 삭제하지 않고 비활성화 상태로 유지한다.

### FR-003 지점 관리
* 관리자는 지점을 등록 / 수정 / 비활성화할 수 있다.
* **지점 정보:** 지점 ID, 지점명, 주소, 연락처, 운영 상태, 등록일.
* **삭제 정책:** 과거 연차 기록 및 통계 데이터 보존을 위해 DB 물리 삭제 대신 Soft Delete(`INACTIVE`) 방식을 적용한다.

### FR-004 연차 관리 및 조정
* 관리자는 직원의 연차 총량을 설정 및 수동 조정할 수 있다.
* 연차 조정 시 조정 사유와 수치(+1.0, -0.5 등)를 포함하여 **연차 조정 이력(`LeaveAdjustment`)**을 반드시 기록한다.

### FR-005 연차 신청
* 직원은 시작일, 종료일, 휴가 유형(연차/오전반차/오후반차), 사유를 입력하여 연가를 신청한다.
* 주말/공휴일/지점 휴무일 제외 옵션에 맞춰 연차 차감 일수(`days`)가 자동 계산된다.

### FR-006 연차 승인 / 반려
* 관리자는 대기 중인 연차 신청 건을 승인하거나 반려할 수 있다.
* 반려 시 관리자는 **반려 사유**를 필수적으로 입력해야 한다.

### FR-007 연차 신청 취소
* 직원은 승인 전대기(`PENDING`) 상태의 신청 건을 직접 취소할 수 있다.
* 이미 승인(`APPROVED`)된 연가는 직원이 직접 취소할 수 없으며, 관리자에게 취소 요청을 하거나 관리자가 직접 취소 처리해야 한다.

### FR-008 연차 중복 신청 방지
* 동일 직원이 동일 날짜에 중복으로 휴가를 신청할 수 없도록 서버 및 DB 단에서 검증한다.

### FR-009 연차 잔여일수 검증
* 직원이 보유한 신청 가능 연차보다 많은 일수의 휴가를 신청할 수 없도록 차단한다.

### FR-010 지점별 직원 및 인원 조회
* 관리자는 지점별 소속 직원 목록과 특정 날짜의 지점별 휴가/근무 예정 인원 현황을 조회할 수 있다.

### FR-011 지점 이동 관리
* 관리자는 직원의 소속 지점을 변경할 수 있으며, 변경 시 **지점 이동 이력(`BranchHistory`)**이 기록된다.

### FR-012 연차 사용 이력 조회
* 직원은 자신의 연차 신청/사용/반려 이력을 조회할 수 있다.
* 관리자는 전체 직원의 연차 사용 이력을 조회할 수 있다.

### FR-013 캘린더
* 월별 캘린더 뷰를 통해 연차 일정을 시각적으로 제공한다.
* **직원:** 본인의 연차 일정 표시.
* **관리자:** 전체 직원의 연차 일정 표시 및 지점별, 직원별, 상태별 필터링 기능 제공.

---

## 6. 화면 구성 및 경로

### 6.1 공통
* `/login` - 로그인
* `/profile` - 프로필 및 비밀번호 변경

### 6.2 직원 화면
* `/dashboard` - 메인 대시보드 (남은 연차, 다가오는 휴가, 최근 신청 내역)
* `/leave/request` - 연차 신청
* `/leave/history` - 연차 사용 내역
* `/calendar` - 개인 캘린더

### 6.3 관리자 화면
* `/admin/dashboard` - 관리자 대시보드 (KPI 카드, 승인 대기 목록, 오늘 휴가자)
* `/admin/employees` - 직원 관리
* `/admin/branches` - 지점 관리
* `/admin/leaves` - 연차 관리 및 조정
* `/admin/calendar` - 전체 연차 캘린더
* `/admin/audit-logs` - 감사 로그 조회

---

## 7. 모바일 UI 및 PWA 요구사항

* **Mobile First Design:** PWA 기반으로 모바일 화면을 우선 고려하여 UI/UX를 설계한다.
* **하단 네비게이션 바 (직원):** [홈] | [연차신청] | [캘린더] | [마이페이지]
* **기능:** Standalone 실행 지원, Web App Manifest, Service Worker 적용, 오프라인 기본 캐싱.
* **반응형 브레이크포인트:**
  * Mobile: `< 768px` (카드 형태 UI, 하단 네비게이션)
  * Tablet: `768px ~ 1024px`
  * Desktop: `> 1024px` (테이블 중심 UI, 사이드바 네비게이션)

---

## 8. 기술 스택 및 아키텍처

### 추천 기술 스택
* **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
* **Form & Validation:** React Hook Form, Zod
* **Backend:** Next.js Server Actions / Route Handlers
* **Database & ORM:** Neon PostgreSQL, Prisma ORM
* **Authentication:** Auth.js 또는 Session 기반 자체 인증 (패스워드 해싱)
* **PWA:** Web App Manifest + Service Worker
* **Deployment & CI/CD:** Vercel, GitHub / GitLab Automatic Deployment

### 배포 아키텍처

```

[User (PC / Mobile Browser / PWA)]
│
▼
[Vercel Engine]
└─ Next.js (App Router / PWA)
│
▼
[Neon Managed PostgreSQL]

```

---

## 9. 데이터 모델 (Prisma Schema)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  EMPLOYEE
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
  RETIRED
}

enum LeaveType {
  FULL_DAY
  AM_HALF
  PM_HALF
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model User {
  id            String          @id @default(cuid())
  name          String
  email         String          @unique
  passwordHash  String
  phone         String?
  role          Role            @default(EMPLOYEE)
  branchId      String
  branch        Branch          @relation(fields: [branchId], references: [id])
  hireDate      DateTime
  status        EmployeeStatus  @default(ACTIVE)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  leaveBalances LeaveBalance[]
  leaveRequests LeaveRequest[]
  auditLogs     AuditLog[]      @relation("AdminAuditLogs")

  @@index([branchId])
}

model Branch {
  id        String   @id @default(cuid())
  name      String
  address   String?
  phone     String?
  status    String   @default("ACTIVE") // ACTIVE, INACTIVE
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
}

model LeaveBalance {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  year            Int
  totalDays       Float    @default(0) // 기본 부여 연차
  carriedOverDays Float    @default(0) // 이월 연차
  usedDays        Float    @default(0) // 승인 완료된 사용 연차
  adjustedDays    Float    @default(0) // 관리자 수동 조정 연차
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, year])
}

model LeaveRequest {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id])
  type            LeaveType
  startDate       DateTime
  endDate         DateTime
  days            Float       // 계산된 차감 일수 (1.0, 0.5 등)
  reason          String
  status          LeaveStatus @default(PENDING)
  rejectionReason String?
  approvedBy      String?
  approvedAt      DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([userId, status])
  @@index([startDate, endDate])
}

model LeaveAdjustment {
  id        String   @id @default(cuid())
  userId    String
  year      Int
  amount    Float    // 예: +1.0, -0.5
  reason    String
  createdBy String
  createdAt DateTime @default(now())
}

model BranchHistory {
  id           String   @id @default(cuid())
  userId       String
  fromBranchId String
  toBranchId   String
  changedBy    String
  reason       String?
  changedAt    DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(cuid())
  adminId     String
  admin       User     @relation("AdminAuditLogs", fields: [adminId], references: [id])
  action      String   // 예: UPDATE_LEAVE, APPROVE_REQUEST
  targetType  String   // USER, LEAVE_REQUEST
  targetId    String
  description String
  createdAt   DateTime @default(now())
}

```

---

## 10. 개발 단계별 MVP 범위 (Phase Plan)

### Phase 1 (MVP - 필수 핵심)

* 사용자 인증 (로그인/로그아웃)
* 직원 및 지점 CRUD (Soft Delete 적용)
* 연차 기본 설정 및 부여 기능
* 직원: 연차 잔여 조회 및 신청 (중복/잔여일수 검증)
* 관리자: 대시보드 및 연차 승인/반려 (반려 사유 입력)
* 인앱 Toast 알림
* 모바일 반응형 UI + PWA 기초 설정

### Phase 2 (기능 확장)

* 전체 연차 캘린더 (지점/상태별 필터링)
* 지점별 최소 근무 인원 경고 표시
* 연차 수동 조정 및 이월 처리 (`carriedOverDays`)
* 지점 이동 이력 및 AuditLog 기록

### Phase 3 (고도화)

* PWA Web Push 및 Kakao/Slack Webhook 알림 연동
* 공휴일 / 지점 휴무일 API 연동 및 자동 계산
* 연차 사용 통계 및 CSV/Excel 다운로드

---

## 11. 개발 전 최종 확정 정책 체크리스트

| 항목 | 확정안 (권장) | 비고 |
| --- | --- | --- |
| **연차 기준연도** | **회계연도 기준 (1월 1일)** | 소규모 지점 관리 편의성 우수 |
| **미사용 연차** | **관리자 수동 이월 허용** | `carriedOverDays` 필드로 관리 |
| **마이너스 연차** | **원칙적 불허** | 관리자 수동 조정으로 예외 대응 |
| **승인 방식** | **관리자 승인 필수** | 지점 인력 공백 방지 |
| **중복 신청** | **DB 트랜잭션 검증 및 차단** | Race Condition 방지 |

```

```
