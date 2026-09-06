import { describe, expect, it } from "vitest";
import { isShadedDay, monthBounds, monthGrid, resolveMonthParam, shiftMonth } from "@/lib/calendar";

describe("monthBounds", () => {
  it("달마다 말일이 다르다", () => {
    expect(monthBounds("2026-09")).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(monthBounds("2026-10")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
  });
  it("윤년 2월은 29일", () => {
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(monthBounds("2026-02").last).toBe("2026-02-28");
  });
});

describe("shiftMonth", () => {
  it("연도 경계를 넘는다", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("말일이 있는 달로 굴러가지 않는다", () => {
    expect(shiftMonth("2026-01", 1)).toBe("2026-02");
  });
});

describe("resolveMonthParam", () => {
  it("올바른 YYYY-MM은 그대로", () => {
    expect(resolveMonthParam("2027-03", "2026-09-06")).toBe("2027-03");
  });
  it("없거나 형식이 틀리면 오늘의 달", () => {
    for (const bad of [undefined, "", "abc", "2026-13", "2026-00", "2026-9", "202609"]) {
      expect(resolveMonthParam(bad, "2026-09-06")).toBe("2026-09");
    }
  });
});

describe("monthGrid", () => {
  it("항상 42칸이고 일요일에서 시작한다", () => {
    const g = monthGrid("2026-09");
    expect(g).toHaveLength(42);
    expect(g[0].iso).toBe("2026-08-30"); // 2026-09-01은 화요일
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
  });
});

describe("isShadedDay", () => {
  // 2026-09-05 토, 09-06 일, 09-07 월, 09-08 화
  it("주말은 휴무 지정이 없어도 칠한다", () => {
    expect(isShadedDay("2026-09-05", [], null)).toBe(true);
    expect(isShadedDay("2026-09-06", [], null)).toBe(true);
  });
  it("평일은 지정이 없으면 안 칠한다", () => {
    expect(isShadedDay("2026-09-07", [], null)).toBe(false);
    expect(isShadedDay("2026-09-08", [], null)).toBe(false);
  });
  it("지점 휴무 요일을 칠한다", () => {
    expect(isShadedDay("2026-09-07", [1], null)).toBe(true);
    expect(isShadedDay("2026-09-08", [1], null)).toBe(false);
  });
  it("공휴일을 칠한다", () => {
    expect(isShadedDay("2026-09-07", [], "추석")).toBe(true);
  });
  it("주말이면서 지점 휴무여도 한 번만 참이다", () => {
    expect(isShadedDay("2026-09-06", [0], "추석")).toBe(true);
  });
  it("차감 규칙이 아니다 — 주말 근무 지점의 토요일도 칠해진다", () => {
    // 강남점은 closedWeekdays: [] 라 토요일 연차가 차감되지만 음영은 들어간다.
    expect(isShadedDay("2026-09-05", [], null)).toBe(true);
  });
});
