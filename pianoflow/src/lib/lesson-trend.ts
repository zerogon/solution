import { addMonth } from "@/lib/month";
import { formatKstDate } from "@/lib/slots";

export const TREND_SPAN = 6;

export interface TeacherLessonTrend {
  endMonth: string;
  /** 오름차순 TREND_SPAN개월: [endMonth-5 … endMonth] */
  months: string[];
  /**
   * 선생님별 월간 건수. 인덱스 = 전체 선생님 name asc 순번 —
   * teacher-colors.ts의 색 인덱스와 같은 계약이라 월 이동으로 재배색되지 않는다.
   */
  series: { name: string; counts: number[] }[];
  /** 전 시리즈 최대값 (최소 1 — y축 스케일용) */
  max: number;
}

export function trendMonths(endMonth: string): string[] {
  return Array.from({ length: TREND_SPAN }, (_, i) =>
    addMonth(endMonth, i - (TREND_SPAN - 1)),
  );
}

export function buildTeacherLessonTrend(
  endMonth: string,
  teachers: { id: string; name: string }[],
  reservations: { teacherId: string; slotDatetime: Date }[],
): TeacherLessonTrend {
  const months = trendMonths(endMonth);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const countsByTeacher = new Map(
    teachers.map((t) => [t.id, new Array(TREND_SPAN).fill(0) as number[]]),
  );

  for (const r of reservations) {
    const mi = monthIndex.get(formatKstDate(r.slotDatetime).slice(0, 7));
    const counts = countsByTeacher.get(r.teacherId);
    if (mi !== undefined && counts) counts[mi] += 1;
  }

  const series = teachers.map((t) => ({
    name: t.name,
    counts: countsByTeacher.get(t.id)!,
  }));
  const max = Math.max(1, ...series.flatMap((s) => s.counts));

  return { endMonth, months, series, max };
}
