import { LeaveType } from "@/generated/prisma/enums";
import type { HolidayOracle } from "@/lib/holidays-kr";
import { addDaysIso, diffDaysIso, parseDate } from "@/lib/utils";

/**
 * 연차 차감 일수 계산 — 순수 함수. 서버(신청·재검증)와 클라이언트(미리보기)가 같은 코드를 돈다.
 *
 * ## 규칙
 * - 지점 정기 휴무 요일(`closedWeekdays`)과 법정공휴일은 세지 않는다. 그 날은 어차피 쉬는 날이다.
 * - **주말은 자동 제외하지 않는다.** 카페는 주말 영업이 기본이고, 쉬는 요일은 지점이 정한다.
 * - 반차는 하루만, 그 날이 쉬는 날이면 신청 자체가 무의미하므로 거부한다.
 * - 공휴일 데이터가 없는 연도(`oracle.covers === false`)는 **계산하지 않는다.** 모르는 채로
 *   세면 휴일을 근무일로 쳐서 직원이 손해 보는 방향이다.
 *
 * `countedDates`가 곧 `LeaveRequestDay` 행이다 — 휴무·공휴일은 행을 만들지 않으므로
 * 같은 날 다른 신청과 충돌하지 않는다.
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

/** 한 번의 신청이 덮을 수 있는 최대 달력 일수. 그보다 길면 나눠서 신청한다. */
export const MAX_RANGE_DAYS = 31;

export const LEAVE_DAYS_ERROR_MESSAGE: Record<Extract<LeaveDaysResult, { ok: false }>["reason"], string> = {
  range: "종료일이 시작일보다 앞설 수 없습니다.",
  year_boundary: "연도를 넘기는 신청은 나눠서 해주세요.",
  too_long: `한 번에 ${MAX_RANGE_DAYS}일까지만 신청할 수 있습니다.`,
  uncovered: "해당 기간의 공휴일 정보를 확인할 수 없어 신청할 수 없습니다. 잠시 후 다시 시도해주세요.",
  half_day_not_single: "반차는 하루만 선택할 수 있습니다.",
  half_day_off: "선택한 날은 지점 휴무일 또는 공휴일입니다.",
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

export function computeLeaveDays(input: {
  type: LeaveType;
  startIso: string;
  endIso: string;
  closedWeekdays: readonly number[];
  oracle: HolidayOracle;
}): LeaveDaysResult {
  const { type, startIso, endIso, closedWeekdays, oracle } = input;

  if (startIso > endIso) return { ok: false, reason: "range" };
  if (startIso.slice(0, 4) !== endIso.slice(0, 4)) return { ok: false, reason: "year_boundary" };
  if (diffDaysIso(startIso, endIso) + 1 > MAX_RANGE_DAYS) return { ok: false, reason: "too_long" };

  if (type !== LeaveType.FULL_DAY) {
    if (startIso !== endIso) return { ok: false, reason: "half_day_not_single" };
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
