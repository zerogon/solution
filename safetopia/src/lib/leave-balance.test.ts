import { describe, expect, it } from "vitest";
import { roundHalf, summarize } from "@/lib/leave-balance";

describe("summarize", () => {
  it("PRD 4.2 산식", () => {
    const s = summarize({ totalDays: 15, carriedOverDays: 2, adjustedDays: -1, usedDays: 3.5 });
    expect(s).toEqual({ total: 16, used: 3.5, remaining: 12.5 });
  });

  it("사용이 보유를 넘으면 remaining이 음수로 드러난다(마이너스 불허는 호출자가 판단)", () => {
    const s = summarize({ totalDays: 1, carriedOverDays: 0, adjustedDays: 0, usedDays: 1.5 });
    expect(s.remaining).toBe(-0.5);
  });

  it("부동소수 잡음은 0.5 단위로 정리된다", () => {
    expect(roundHalf(0.1 + 0.2 + 0.2)).toBe(0.5);
    expect(roundHalf(2.4999999)).toBe(2.5);
  });
});
