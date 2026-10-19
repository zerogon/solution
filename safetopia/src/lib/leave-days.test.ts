import { describe, expect, it } from "vitest";
import { LeaveType } from "@/generated/prisma/enums";
import { holidayOracle } from "@/lib/holidays-kr";
import { computeLeaveDays, manualEntryDates } from "@/lib/leave-days";

// 2026 추석: 9/24(목)~9/26(토), 대체공휴일 9/28(월). 개천절 10/3(토) → 대체 10/5(월).
const oracle = holidayOracle([2026], {
  "2026": {
    "2026-09-24": "추석",
    "2026-09-25": "추석",
    "2026-09-26": "추석",
    "2026-09-28": "대체공휴일",
    "2026-10-03": "개천절",
    "2026-10-05": "대체공휴일",
  },
});

const WEEKEND = [0, 6];

describe("computeLeaveDays — 연차", () => {
  it("휴무일·공휴일 없는 평일 3일은 3.0", () => {
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-14", endIso: "2026-09-16", closedWeekdays: [], oracle });
    expect(r).toMatchObject({ ok: true, days: 3 });
    if (r.ok) expect(r.countedDates).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("기본 쉬는 요일(토·일)은 뺀다 — 금~월 4일 중 2일", () => {
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-11", endIso: "2026-09-14", closedWeekdays: WEEKEND, oracle });
    expect(r).toMatchObject({ ok: true, days: 2 });
    if (r.ok) expect(r.countedDates).toEqual(["2026-09-11", "2026-09-14"]);
  });

  it("쉬는 요일을 비우면 주말도 센다", () => {
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-12", endIso: "2026-09-13", closedWeekdays: [], oracle });
    expect(r).toMatchObject({ ok: true, days: 2 });
  });

  it("쉬는 요일(월)과 공휴일은 뺀다", () => {
    // 9/21(월 휴무) 9/22 9/23 9/24(추석) 9/25(추석) → 2일
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-21", endIso: "2026-09-25", closedWeekdays: [1], oracle });
    expect(r).toMatchObject({ ok: true, days: 2 });
    if (r.ok) {
      expect(r.countedDates).toEqual(["2026-09-22", "2026-09-23"]);
      expect(r.skipped.map((s) => s.reason)).toEqual(["closed", "holiday", "holiday"]);
      expect(r.skipped[1].name).toBe("추석");
    }
  });

  it("휴무 요일과 공휴일이 겹치는 날은 한 번만 건너뛴다(closed 우선)", () => {
    // 9/28(월) 대체공휴일이면서 월 휴무
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-28", endIso: "2026-09-29", closedWeekdays: [1], oracle });
    expect(r).toMatchObject({ ok: true, days: 1 });
    if (r.ok) expect(r.skipped).toEqual([{ iso: "2026-09-28", reason: "closed", name: undefined }]);
  });

  it("기간 전체가 쉬는 날이면 no_working_day", () => {
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-24", endIso: "2026-09-26", closedWeekdays: [], oracle });
    expect(r).toEqual({ ok: false, reason: "no_working_day" });
  });

  it("종료일이 앞서면 range", () => {
    expect(computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-16", endIso: "2026-09-14", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "range" });
  });

  it("해를 넘기면 year_boundary — 부여가 연도 단위라 나눠서 기록한다", () => {
    const wide = holidayOracle([2026, 2027], { "2026": {}, "2027": {} });
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-12-30", endIso: "2027-01-02", closedWeekdays: [], oracle: wide });
    expect(r).toEqual({ ok: false, reason: "year_boundary" });
  });

  it("12/31로 끝나면 통과한다", () => {
    const wide = holidayOracle([2026], { "2026": {} });
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-12-30", endIso: "2026-12-31", closedWeekdays: [], oracle: wide });
    expect(r).toMatchObject({ ok: true, days: 2 });
  });

  it("31일 초과는 too_long", () => {
    expect(computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2026-09-01", endIso: "2026-10-02", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "too_long" });
  });

  it("공휴일 데이터가 없는 연도는 uncovered — 계산하지 않는다", () => {
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2027-03-01", endIso: "2027-03-02", closedWeekdays: [], oracle });
    expect(r).toEqual({ ok: false, reason: "uncovered", at: "2027-03-01" });
  });

  it("휴무 요일은 오라클을 묻지 않는다 — 데이터 없는 해라도 휴무일 자체는 판정된다", () => {
    // 2027-03-01(월)이 휴무면 그 날은 covers 없이 skip되고, 다음 날에서 uncovered.
    const r = computeLeaveDays({ type: LeaveType.FULL_DAY, startIso: "2027-03-01", endIso: "2027-03-02", closedWeekdays: [1], oracle });
    expect(r).toEqual({ ok: false, reason: "uncovered", at: "2027-03-02" });
  });
});

describe("computeLeaveDays — 반차", () => {
  it("평일 반차는 0.5", () => {
    const r = computeLeaveDays({ type: LeaveType.AM_HALF, startIso: "2026-09-15", endIso: "2026-09-15", closedWeekdays: [], oracle });
    expect(r).toMatchObject({ ok: true, days: 0.5, countedDates: ["2026-09-15"] });
  });

  it("이틀 이상이면 half_day_not_single", () => {
    expect(computeLeaveDays({ type: LeaveType.PM_HALF, startIso: "2026-09-15", endIso: "2026-09-16", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "half_day_not_single" });
  });

  it("휴무일·공휴일 반차는 half_day_off", () => {
    expect(computeLeaveDays({ type: LeaveType.AM_HALF, startIso: "2026-09-24", endIso: "2026-09-24", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "half_day_off", at: "2026-09-24" });
    expect(computeLeaveDays({ type: LeaveType.AM_HALF, startIso: "2026-09-21", endIso: "2026-09-21", closedWeekdays: [1], oracle })).toEqual({ ok: false, reason: "half_day_off", at: "2026-09-21" });
  });
});

describe("manualEntryDates — 일수 직접 입력", () => {
  it("공휴일 데이터가 없는 해라도 막지 않고, 쉬는 요일만 빼서 날짜 행을 만든다", () => {
    // 2024-05-03(금)~05-07(화): 토·일 빼고 금·월·화. 5/6 대체공휴일은 데이터가 없어 근무일로 남는다.
    const r = manualEntryDates({ type: LeaveType.FULL_DAY, startIso: "2024-05-03", endIso: "2024-05-07", closedWeekdays: WEEKEND, oracle });
    expect(r).toEqual({ ok: true, dates: ["2024-05-03", "2024-05-06", "2024-05-07"] });
  });

  it("데이터가 있는 해는 공휴일도 뺀다", () => {
    const r = manualEntryDates({ type: LeaveType.FULL_DAY, startIso: "2026-09-23", endIso: "2026-09-25", closedWeekdays: WEEKEND, oracle });
    expect(r).toEqual({ ok: true, dates: ["2026-09-23"] });
  });

  it("전부 쉬는 날이면 범위 전체를 쓴다", () => {
    const r = manualEntryDates({ type: LeaveType.FULL_DAY, startIso: "2026-09-12", endIso: "2026-09-13", closedWeekdays: WEEKEND, oracle });
    expect(r).toEqual({ ok: true, dates: ["2026-09-12", "2026-09-13"] });
  });

  it("모양 검사는 자동 계산과 같다", () => {
    expect(manualEntryDates({ type: LeaveType.FULL_DAY, startIso: "2026-12-31", endIso: "2027-01-01", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "year_boundary" });
    expect(manualEntryDates({ type: LeaveType.AM_HALF, startIso: "2026-09-15", endIso: "2026-09-16", closedWeekdays: [], oracle })).toEqual({ ok: false, reason: "half_day_not_single" });
  });
});
