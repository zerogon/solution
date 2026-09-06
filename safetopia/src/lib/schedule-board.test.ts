import { describe, expect, it } from "vitest";
import { LeaveType } from "@/generated/prisma/enums";
import { diffDaysIso } from "@/lib/utils";
import { buildDayRoster, buildScheduleBoard, rangeDays } from "@/lib/schedule-board";

const gangnam = { id: "b1", name: "강남점", closedWeekdays: [1] };
const hongdae = { id: "b2", name: "홍대점", closedWeekdays: [] };
const summary = { total: 15, used: 3, remaining: 12 };

describe("rangeDays", () => {
  it("월말을 넘어 이어진다", () => {
    expect(rangeDays("2026-09-29", 4)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
  it("0개면 빈 배열", () => {
    expect(rangeDays("2026-09-05", 0)).toEqual([]);
  });
  it("월 경계로 호출하면 그 달의 날 수만큼 나온다(대시보드 보드 기간)", () => {
    const span = (first: string, last: string) => rangeDays(first, diffDaysIso(first, last) + 1);
    expect(span("2028-02-01", "2028-02-29")).toHaveLength(29);
    expect(span("2026-09-01", "2026-09-30")).toHaveLength(30);
    const oct = span("2026-10-01", "2026-10-31");
    expect(oct).toHaveLength(31);
    expect(oct.at(-1)).toBe("2026-10-31");
  });
});

describe("buildScheduleBoard", () => {
  const days = rangeDays("2026-09-05", 3);

  it("지점별로 묶고 소속 없음은 맨 뒤", () => {
    const groups = buildScheduleBoard({
      users: [
        { id: "u3", name: "무소속", branch: null, summary: null },
        { id: "u2", name: "홍", branch: hongdae, summary },
        { id: "u1", name: "강", branch: gangnam, summary },
      ],
      dayRows: [],
      days,
    });
    expect(groups.map((g) => g.branch?.name ?? null)).toEqual(["강남점", "홍대점", null]);
    expect(groups[2].members[0].summary).toBeNull();
  });

  it("반차는 0.5로 합산하고 범위 밖 행은 무시한다", () => {
    const [g] = buildScheduleBoard({
      users: [
        { id: "u1", name: "가", branch: gangnam, summary },
        { id: "u2", name: "나", branch: gangnam, summary },
      ],
      dayRows: [
        { userId: "u1", date: "2026-09-05", type: LeaveType.FULL_DAY },
        { userId: "u2", date: "2026-09-05", type: LeaveType.AM_HALF },
        { userId: "u2", date: "2026-09-06", type: LeaveType.PM_HALF },
        { userId: "u1", date: "2026-09-08", type: LeaveType.FULL_DAY }, // 범위 밖
      ],
      days,
    });
    expect(g.offByDay).toEqual({ "2026-09-05": 1.5, "2026-09-06": 0.5 });
    expect(g.members[0].cells).toEqual({ "2026-09-05": LeaveType.FULL_DAY });
    expect(g.members[1].cells).toEqual({ "2026-09-05": LeaveType.AM_HALF, "2026-09-06": LeaveType.PM_HALF });
  });

  it("직원이 없으면 빈 배열", () => {
    expect(buildScheduleBoard({ users: [], dayRows: [{ userId: "x", date: "2026-09-05", type: LeaveType.FULL_DAY }], days })).toEqual([]);
  });
});

describe("buildDayRoster", () => {
  const days = rangeDays("2026-09-05", 3);
  const groups = buildScheduleBoard({
    users: [
      { id: "u1", name: "가", branch: gangnam, summary },
      { id: "u2", name: "나", branch: hongdae, summary },
      { id: "u3", name: "다", branch: null, summary: null },
    ],
    dayRows: [
      { userId: "u2", date: "2026-09-05", type: LeaveType.AM_HALF },
      { userId: "u1", date: "2026-09-05", type: LeaveType.FULL_DAY },
      { userId: "u3", date: "2026-09-06", type: LeaveType.PM_HALF },
    ],
    days,
  });
  const roster = buildDayRoster(groups);

  it("보드 순서(지점명 → 이름)를 그대로 물려받는다", () => {
    expect(roster["2026-09-05"]).toEqual([
      { userId: "u1", name: "가", branchName: "강남점", type: LeaveType.FULL_DAY },
      { userId: "u2", name: "나", branchName: "홍대점", type: LeaveType.AM_HALF },
    ]);
  });
  it("소속 없음은 branchName이 null", () => {
    expect(roster["2026-09-06"]).toEqual([
      { userId: "u3", name: "다", branchName: null, type: LeaveType.PM_HALF },
    ]);
  });
  it("휴가가 없는 날은 키를 만들지 않는다", () => {
    expect("2026-09-07" in roster).toBe(false);
  });
});
