import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CreditChangeReason, ReservationStatus } from "@/generated/prisma/enums";
import { formatKstDate, parseKstDate } from "@/lib/slots";

type Db = Prisma.TransactionClient | typeof prisma;

/** KST 기준 내일 0시(UTC Date). slotDatetime >= 이 값이면 "아직 사용 전" 예약 */
export function kstTomorrowStart(now: Date = new Date()): Date {
  return new Date(parseKstDate(formatKstDate(now)).getTime() + 86_400_000);
}

/**
 * 학생별 "예약됨" 횟수 = 내일 0시(KST) 이후 ACTIVE 예약 중 실제 RESERVE 차감이
 * 발생한 건수. (잔여 0에서 강제/고정 예약으로 차감 없이 생성된 건은 제외 —
 * 차감이 없었으니 표시에 되돌릴 것도 없다.)
 *
 * 화면 표시용 남은 횟수 = remainingLessons + 이 값. DB의 remainingLessons는
 * 예약 시점에 실차감되어 초과 예약을 막고, 표시만 "오늘 기준 소진분"으로 보정한다.
 * 수업 당일이 되면 자연히 "미래"에서 빠지므로 별도 배치가 필요 없다.
 */
export async function reservedFutureCounts(
  studentIds: string[],
  now: Date = new Date(),
  db: Db = prisma,
): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  // LessonCreditLog.reservationId는 relation이 없는 plain 컬럼이라 2단계 쿼리
  const future = await db.reservation.findMany({
    where: {
      studentId: { in: studentIds },
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: kstTomorrowStart(now) },
    },
    select: { id: true },
  });
  if (future.length === 0) return new Map();
  const grouped = await db.lessonCreditLog.groupBy({
    by: ["studentId"],
    where: {
      reservationId: { in: future.map((r) => r.id) },
      reason: CreditChangeReason.RESERVE,
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.studentId, g._count._all]));
}

/** 단일 학생 편의 버전 */
export async function reservedFutureCount(
  studentId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<number> {
  return (await reservedFutureCounts([studentId], now, db)).get(studentId) ?? 0;
}
