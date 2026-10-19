import { describe, expect, it } from "vitest";
import { roundHalf, summarize } from "@/lib/leave-balance";

describe("summarize", () => {
  it("부여 + 이월 - 사용", () => {
    const s = summarize({ grantedDays: 15, carriedOverDays: 2, used: 3.5 });
    expect(s).toEqual({ granted: 15, carriedOver: 2, total: 17, used: 3.5, remaining: 13.5 });
  });

  it("사용이 보유를 넘으면 remaining이 음수로 드러난다(기록은 막지 않는다)", () => {
    const s = summarize({ grantedDays: 1, carriedOverDays: 0, used: 1.5 });
    expect(s.remaining).toBe(-0.5);
  });

  it("부여가 없는 해는 전부 0에서 시작한다", () => {
    expect(summarize({ grantedDays: 0, carriedOverDays: 0, used: 2 }).remaining).toBe(-2);
  });

  it("부동소수 잡음은 0.5 단위로 정리된다", () => {
    expect(roundHalf(0.1 + 0.2 + 0.2)).toBe(0.5);
    expect(roundHalf(2.4999999)).toBe(2.5);
  });
});
