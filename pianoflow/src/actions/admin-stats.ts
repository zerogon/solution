"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseKstDate } from "@/lib/slots";
import { addMonth, MONTH_RE } from "@/lib/month";
import { ReservationStatus, Role } from "@/generated/prisma/enums";

export interface MonthlyLessons {
  month: string;
  rows: { name: string; count: number }[];
  total: number;
  max: number;
}

/** 특정 월("YYYY-MM")의 선생님별 활성 예약 건수 집계 (관리자 전용) */
export async function getMonthlyTeacherLessons(
  month: string,
): Promise<MonthlyLessons> {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    throw new Error("관리자 권한이 필요합니다.");
  }
  if (!MONTH_RE.test(month)) {
    throw new Error("잘못된 월 형식입니다.");
  }

  const monthStart = parseKstDate(`${month}-01`);
  const monthEnd = parseKstDate(`${addMonth(month, 1)}-01`);

  const [grouped, teachers] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["teacherId"],
      where: {
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: monthStart, lt: monthEnd },
      },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { role: Role.TEACHER },
      orderBy: { name: "asc" },
    }),
  ]);

  const countByTeacher = new Map(
    grouped.map((g) => [g.teacherId, g._count._all]),
  );
  const rows = teachers.map((t) => ({
    name: t.name,
    count: countByTeacher.get(t.id) ?? 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return { month, rows, total, max };
}
