import { LeaveType } from "@/generated/prisma/enums";

/** 한글 라벨 단일 출처. 화면·배지·셀렉트가 전부 여기서 읽는다. */

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  [LeaveType.FULL_DAY]: "연차",
  [LeaveType.AM_HALF]: "오전 반차",
  [LeaveType.PM_HALF]: "오후 반차",
};

/** 0=일 … 6=토 (JS getUTCDay 규약, `Owner.closedWeekdays`와 같다). */
export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 0.5 단위 일수를 "1.5일"처럼. 정수는 소수점 없이. */
export function formatDays(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}일`;
}
