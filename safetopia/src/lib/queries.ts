import { prisma } from "@/lib/prisma";
import { summarize, type BalanceSummary } from "@/lib/leave-balance";
import { parseDate } from "@/lib/utils";

/**
 * 장부 읽기. 연도는 캘린더 연도(1/1~12/31)이고 한 기록은 한 해 안에 있다(`leave-days.ts`
 * `year_boundary`) — 그래서 "그 해의 기록" = 시작일이 그 해에 있는 기록이다.
 */

export interface YearSummary {
  year: number;
  /** 그 해 부여를 아직 입력하지 않았는지. 입력 전이라도 사용은 집계해서 보여 준다. */
  missing: boolean;
  memo: string | null;
  summary: BalanceSummary;
}

function yearRange(year: number) {
  return { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) };
}

export async function getYearSummary(year: number): Promise<YearSummary> {
  const [row, used] = await Promise.all([
    prisma.leaveYear.findUnique({ where: { year } }),
    prisma.leaveEntry.aggregate({ where: { startDate: yearRange(year) }, _sum: { days: true } }),
  ]);
  return {
    year,
    missing: !row,
    memo: row?.memo ?? null,
    summary: summarize({
      grantedDays: row?.grantedDays ?? 0,
      carriedOverDays: row?.carriedOverDays ?? 0,
      used: used._sum.days ?? 0,
    }),
  };
}

/**
 * 부여를 입력했거나 기록이 있는 모든 해 + `ensureYear`. 최신 연도가 위로.
 * 연도 선택기와 설정의 연도별 부여 표가 쓴다.
 */
export async function getYearSummaries(ensureYear: number): Promise<YearSummary[]> {
  const [rows, entries] = await Promise.all([
    prisma.leaveYear.findMany(),
    prisma.leaveEntry.findMany({ select: { startDate: true, days: true } }),
  ]);
  const usedByYear = new Map<number, number>();
  for (const e of entries) {
    const y = e.startDate.getUTCFullYear();
    usedByYear.set(y, (usedByYear.get(y) ?? 0) + e.days);
  }
  const years = new Set<number>([ensureYear, ...rows.map((r) => r.year), ...usedByYear.keys()]);
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const row = rows.find((r) => r.year === year);
      return {
        year,
        missing: !row,
        memo: row?.memo ?? null,
        summary: summarize({
          grantedDays: row?.grantedDays ?? 0,
          carriedOverDays: row?.carriedOverDays ?? 0,
          used: usedByYear.get(year) ?? 0,
        }),
      };
    });
}

export async function getOwner() {
  const owner = await prisma.owner.findUnique({ where: { id: "owner" } });
  if (!owner) throw new Error("Owner 행이 없습니다. `npm run owner:set-password`로 먼저 만드세요.");
  return owner;
}
