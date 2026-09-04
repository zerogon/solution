import {
  BranchStatus,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  Role,
} from "@/generated/prisma/enums";

/** 한글 라벨 단일 출처. 화면·배지·셀렉트가 전부 여기서 읽는다. */

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: "관리자",
  [Role.EMPLOYEE]: "직원",
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  [EmployeeStatus.ACTIVE]: "재직",
  [EmployeeStatus.INACTIVE]: "휴직",
  [EmployeeStatus.RETIRED]: "퇴사",
};

export const BRANCH_STATUS_LABEL: Record<BranchStatus, string> = {
  [BranchStatus.ACTIVE]: "운영",
  [BranchStatus.INACTIVE]: "비활성",
};

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  [LeaveType.FULL_DAY]: "연차",
  [LeaveType.AM_HALF]: "오전 반차",
  [LeaveType.PM_HALF]: "오후 반차",
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  [LeaveStatus.PENDING]: "승인 대기",
  [LeaveStatus.APPROVED]: "승인",
  [LeaveStatus.REJECTED]: "반려",
  [LeaveStatus.CANCELLED]: "취소",
};

/** 0=일 … 6=토 (JS getUTCDay 규약, `Branch.closedWeekdays`와 같다). */
export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 0.5 단위 일수를 "1.5일"처럼. 정수는 소수점 없이. */
export function formatDays(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}일`;
}
