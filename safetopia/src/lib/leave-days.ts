import { LeaveType } from "@/generated/prisma/enums";
import type { HolidayOracle } from "@/lib/holidays-kr";
import { addDaysIso, diffDaysIso, parseDate } from "@/lib/utils";

/**
 * 연차 차감 일수 계산 — 순수 함수. 서버(저장 시 재계산)와 클라이언트(미리보기)가 같은 코드를 돈다.
 *
 * ## 규칙
 * - 쉬는 요일(`Owner.closedWeekdays`, 기본 토·일)과 법정공휴일은 세지 않는다. 그 날은 어차피 쉬는 날이다.
 * - 반차는 하루만, 그 날이 쉬는 날이면 기록 자체가 무의미하므로 거부한다.
 * - 공휴일 데이터가 없는 연도(`oracle.covers === false`)는 **계산하지 않는다.** 모르는 채로
 *   세면 휴일을 근무일로 쳐서 연차를 더 깎는 방향이다. 그런 기록(대개 엑셀에서 옮기는 지난 해)은
 *   일수를 직접 입력한다 — `entryDates`.
 * - 한 기록은 **한 해** 안에 들어와야 한다(부여가 연도 단위라서).
 *
 * `countedDates`가 곧 `LeaveEntryDay` 행이다 — 쉬는 날은 행을 만들지 않으므로
 * 같은 날 다른 기록과 충돌하지 않는다.
 */

export type SkipReason = "closed" | "holiday";

export type LeaveDaysResult =
  | {
      ok: true;
      days: number;
      /** 실제 차감되는 날짜들(ISO). 반차는 1개. */
      countedDates: string[];
      skipped: { iso: string; reason: SkipReason; name?: string }[];
    }
  | {
      ok: false;
      reason:
        | "range"
        | "year_boundary"
        | "too_long"
        | "uncovered"
        | "half_day_not_single"
        | "half_day_off"
        | "no_working_day";
      at?: string;
    };

/** 한 기록이 덮을 수 있는 최대 달력 일수. 그보다 길면 나눠서 기록한다. */
export const MAX_RANGE_DAYS = 31;

export const LEAVE_DAYS_ERROR_MESSAGE: Record<Extract<LeaveDaysResult, { ok: false }>["reason"], string> = {
  range: "종료일이 시작일보다 앞설 수 없습니다.",
  year_boundary: "해를 넘기는 기록은 연도별로 나눠서 입력해주세요.",
  too_long: `한 번에 ${MAX_RANGE_DAYS}일까지만 기록할 수 있습니다.`,
  uncovered: "이 기간의 공휴일 정보가 없어 일수를 자동으로 셀 수 없습니다. 일수를 직접 입력해주세요.",
  half_day_not_single: "반차는 하루만 선택할 수 있습니다.",
  half_day_off: "선택한 날은 쉬는 요일이거나 공휴일입니다.",
  no_working_day: "선택한 기간에 근무일이 없습니다.",
};

function dayOff(
  iso: string,
  closedWeekdays: readonly number[],
  oracle: HolidayOracle,
): { off: false } | { off: true; reason: SkipReason; name?: string } | { off: "uncovered" } {
  if (closedWeekdays.includes(parseDate(iso).getUTCDay())) return { off: true, reason: "closed" };
  if (!oracle.covers(iso)) return { off: "uncovered" };
  if (oracle.isHoliday(iso)) return { off: true, reason: "holiday", name: oracle.nameOf(iso) ?? "공휴일" };
  return { off: false };
}

/** 자동·직접 입력 공통의 모양 검사. 통과하면 null. */
function checkRange(type: LeaveType, startIso: string, endIso: string): Extract<LeaveDaysResult, { ok: false }> | null {
  if (startIso > endIso) return { ok: false, reason: "range" };
  if (startIso.slice(0, 4) !== endIso.slice(0, 4)) return { ok: false, reason: "year_boundary" };
  if (diffDaysIso(startIso, endIso) + 1 > MAX_RANGE_DAYS) return { ok: false, reason: "too_long" };
  if (type !== LeaveType.FULL_DAY && startIso !== endIso) return { ok: false, reason: "half_day_not_single" };
  return null;
}

export function computeLeaveDays(input: {
  type: LeaveType;
  startIso: string;
  endIso: string;
  closedWeekdays: readonly number[];
  oracle: HolidayOracle;
}): LeaveDaysResult {
  const { type, startIso, endIso, closedWeekdays, oracle } = input;

  const shape = checkRange(type, startIso, endIso);
  if (shape) return shape;

  if (type !== LeaveType.FULL_DAY) {
    const r = dayOff(startIso, closedWeekdays, oracle);
    if (r.off === "uncovered") return { ok: false, reason: "uncovered", at: startIso };
    if (r.off) return { ok: false, reason: "half_day_off", at: startIso };
    return { ok: true, days: 0.5, countedDates: [startIso], skipped: [] };
  }

  const countedDates: string[] = [];
  const skipped: { iso: string; reason: SkipReason; name?: string }[] = [];
  for (let cur = startIso; cur <= endIso; cur = addDaysIso(cur, 1)) {
    const r = dayOff(cur, closedWeekdays, oracle);
    if (r.off === "uncovered") return { ok: false, reason: "uncovered", at: cur };
    if (r.off) {
      skipped.push({ iso: cur, reason: r.reason, name: r.name });
      continue;
    }
    countedDates.push(cur);
  }
  if (countedDates.length === 0) return { ok: false, reason: "no_working_day" };

  return { ok: true, days: countedDates.length, countedDates, skipped };
}

/**
 * 일수를 직접 입력한 기록의 날짜 행. 자동 계산이 불가능하거나(공휴일 데이터 없는 해) 회사 사정이
 * 달라 사용자가 일수를 정한 경우다. 일수는 사용자 값을 믿고, 날짜 행은 캘린더 표시와 중복 방지용으로
 * **아는 만큼만** 쉬는 날을 뺀다 — 쉬는 요일은 항상, 공휴일은 데이터가 있을 때만.
 * 다 빠져 버리면(주말 하루를 기록하는 등) 범위 전체를 쓴다.
 */
export function manualEntryDates(input: {
  type: LeaveType;
  startIso: string;
  endIso: string;
  closedWeekdays: readonly number[];
  oracle: HolidayOracle;
}): { ok: true; dates: string[] } | Extract<LeaveDaysResult, { ok: false }> {
  const { type, startIso, endIso, closedWeekdays, oracle } = input;
  const shape = checkRange(type, startIso, endIso);
  if (shape) return shape;

  const all: string[] = [];
  for (let cur = startIso; cur <= endIso; cur = addDaysIso(cur, 1)) all.push(cur);
  // "uncovered"는 쉬는 요일 검사를 통과한 날이다 — 공휴일인지 모를 뿐이라 근무일로 둔다.
  const working = all.filter((iso) => dayOff(iso, closedWeekdays, oracle).off !== true);
  return { ok: true, dates: working.length > 0 ? working : all };
}
