import { describe, expect, it } from "vitest";
import {
  accrualOn,
  annualDaysForYears,
  autoDaysForPeriod,
  formatPeriodLabel,
  monthlyAccruedDays,
  nextAccrualIso,
  periodByIndex,
  periodFor,
} from "@/lib/leave-accrual";
import { addDaysIso } from "@/lib/utils";

describe("periodByIndex / periodFor", () => {
  const hire = "2026-03-02";

  it("1회차는 입사일에 시작해 1주년 전날 끝난다", () => {
    expect(periodByIndex(hire, 1)).toEqual({ index: 1, startIso: "2026-03-02", endIso: "2027-03-01" });
  });

  it("입사 당일은 1회차, 1주년 당일은 2회차, 그 전날은 여전히 1회차", () => {
    expect(periodFor(hire, "2026-03-02").index).toBe(1);
    expect(periodFor(hire, "2027-03-01").index).toBe(1);
    expect(periodFor(hire, "2027-03-02").index).toBe(2);
  });

  it("회차 사이에 빈틈도 겹침도 없다", () => {
    for (let n = 1; n <= 20; n++) {
      expect(addDaysIso(periodByIndex(hire, n).endIso, 1)).toBe(periodByIndex(hire, n + 1).startIso);
    }
  });

  it("입사 이전 날짜를 물으면 1회차로 방어한다", () => {
    expect(periodFor(hire, "2020-01-01").index).toBe(1);
  });

  it("index < 1은 1로 클램프", () => {
    expect(periodByIndex(hire, 0)).toEqual(periodByIndex(hire, 1));
  });

  it("말일 입사는 매년 말일로 돌아온다 — 체이닝 드리프트 없음", () => {
    expect(periodByIndex("2026-01-31", 2).startIso).toBe("2027-01-31");
    expect(periodByIndex("2026-01-31", 3).startIso).toBe("2028-01-31");
  });

  it("2/29 입사는 평년 2/28, 윤년 2/29", () => {
    expect(periodByIndex("2024-02-29", 2).startIso).toBe("2025-02-28");
    expect(periodByIndex("2024-02-29", 5).startIso).toBe("2028-02-29");
    expect(periodByIndex("2024-02-29", 1).endIso).toBe("2025-02-27");
  });
});

describe("monthlyAccruedDays", () => {
  it("입사 당일은 0, 1개월 전날 0, 1개월 당일 1", () => {
    expect(monthlyAccruedDays("2026-03-02", "2026-03-02")).toBe(0);
    expect(monthlyAccruedDays("2026-03-02", "2026-04-01")).toBe(0);
    expect(monthlyAccruedDays("2026-03-02", "2026-04-02")).toBe(1);
  });

  it("11개월에 11일, 그 뒤로는 늘지 않는다", () => {
    expect(monthlyAccruedDays("2026-03-02", "2027-02-02")).toBe(11);
    expect(monthlyAccruedDays("2026-03-02", "2027-02-17")).toBe(11);
    expect(monthlyAccruedDays("2026-03-02", "2027-03-02")).toBe(11);
  });

  it("1/31 입사는 2/28에 1일, 3/31에 2일 (말일 클램프 + 앵커 복귀)", () => {
    expect(monthlyAccruedDays("2026-01-31", "2026-02-27")).toBe(0);
    expect(monthlyAccruedDays("2026-01-31", "2026-02-28")).toBe(1);
    expect(monthlyAccruedDays("2026-01-31", "2026-03-30")).toBe(1);
    expect(monthlyAccruedDays("2026-01-31", "2026-03-31")).toBe(2);
  });

  it("윤년 1/31 입사는 2/29에 1일", () => {
    expect(monthlyAccruedDays("2024-01-31", "2024-02-28")).toBe(0);
    expect(monthlyAccruedDays("2024-01-31", "2024-02-29")).toBe(1);
    expect(monthlyAccruedDays("2024-01-31", "2024-03-31")).toBe(2);
  });

  it("8/31 입사는 9/30에 1일, 10/31에 2일", () => {
    expect(monthlyAccruedDays("2026-08-31", "2026-09-29")).toBe(0);
    expect(monthlyAccruedDays("2026-08-31", "2026-09-30")).toBe(1);
    expect(monthlyAccruedDays("2026-08-31", "2026-10-30")).toBe(1);
    expect(monthlyAccruedDays("2026-08-31", "2026-10-31")).toBe(2);
  });

  it("2/29 입사는 3/29에 1일, 11개월 뒤 11일", () => {
    expect(monthlyAccruedDays("2024-02-29", "2024-03-28")).toBe(0);
    expect(monthlyAccruedDays("2024-02-29", "2024-03-29")).toBe(1);
    expect(monthlyAccruedDays("2024-02-29", "2025-01-29")).toBe(11);
  });
});

describe("annualDaysForYears", () => {
  it("만1·2년 15일, 이후 2년마다 1일 가산", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(annualDaysForYears)).toEqual([15, 15, 16, 16, 17, 17, 18]);
  });

  it("상한 25일", () => {
    expect(annualDaysForYears(20)).toBe(24);
    expect(annualDaysForYears(21)).toBe(25);
    expect(annualDaysForYears(22)).toBe(25);
    expect(annualDaysForYears(40)).toBe(25);
  });

  it("1년 미만은 여기서 세지 않는다", () => {
    expect(annualDaysForYears(0)).toBe(0);
    expect(annualDaysForYears(-1)).toBe(0);
  });
});

describe("autoDaysForPeriod", () => {
  const hire = "2026-03-02";

  it("1회차는 진행형이다", () => {
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 1), "2026-07-02")).toBe(4);
  });

  it("끝난 1회차는 11일에서 멈춘다", () => {
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 1), "2030-01-01")).toBe(11);
  });

  it("2회차는 시작·중간·마지막 어디서 물어도 15일", () => {
    const p = periodByIndex(hire, 2);
    for (const on of [p.startIso, "2027-09-01", p.endIso]) {
      expect(autoDaysForPeriod(hire, p, on)).toBe(15);
    }
  });

  it("아직 시작하지 않은 회차는 0 — 다음 회차 연차를 미리 쓸 수 없다", () => {
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 2), "2026-07-02")).toBe(0);
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 5), "2026-07-02")).toBe(0);
    // 시작 당일부터는 전액이 발생한다.
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 2), "2027-03-02")).toBe(15);
  });

  it("가산 회차", () => {
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 4), "2029-06-01")).toBe(16);
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 6), "2031-06-01")).toBe(17);
    expect(autoDaysForPeriod(hire, periodByIndex(hire, 23), "2048-06-01")).toBe(25);
  });
});

describe("accrualOn — 1년 넘은 직원을 새로 등록하는 경우", () => {
  it("입사일만 넣으면 현재 회차와 일수가 즉시 나온다", () => {
    const { period, autoDays } = accrualOn("2019-05-20", "2026-09-10");
    expect(period).toEqual({ index: 8, startIso: "2026-05-20", endIso: "2027-05-19" });
    expect(autoDays).toBe(18);
  });

  it("어제 입사한 직원은 회차만 있고 일수는 0", () => {
    const { period, autoDays } = accrualOn("2026-09-09", "2026-09-10");
    expect(period.index).toBe(1);
    expect(autoDays).toBe(0);
  });

  it("1주년 당일 등록하면 2회차 15일", () => {
    const { period, autoDays } = accrualOn("2025-09-10", "2026-09-10");
    expect(period.index).toBe(2);
    expect(autoDays).toBe(15);
  });
});

describe("nextAccrualIso", () => {
  const hire = "2026-03-02";

  it("1회차 중에는 다음 월 기념일에 1일", () => {
    expect(nextAccrualIso(hire, "2026-07-02")).toEqual({ iso: "2026-08-02", days: 1 });
  });

  it("11일을 다 채우면 다음 회차 시작에 15일", () => {
    expect(nextAccrualIso(hire, "2027-02-15")).toEqual({ iso: "2027-03-02", days: 15 });
  });

  it("2회차 중에는 다음 회차 시작에 그 회차 일수", () => {
    expect(nextAccrualIso(hire, "2027-06-01")).toEqual({ iso: "2028-03-02", days: 15 });
    expect(nextAccrualIso(hire, "2029-06-01")).toEqual({ iso: "2030-03-02", days: 16 });
  });
});

describe("formatPeriodLabel", () => {
  it("1회차만 1년 미만임을 밝힌다", () => {
    expect(formatPeriodLabel(periodByIndex("2026-03-02", 1))).toBe("1년차(1년 미만) · 2026.03.02~2027.03.01");
    expect(formatPeriodLabel(periodByIndex("2026-03-02", 4))).toBe("4년차 · 2029.03.02~2030.03.01");
  });
});
