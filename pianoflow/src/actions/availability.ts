"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  availabilitySchema,
  scheduleExceptionClearSchema,
  scheduleExceptionSchema,
} from "@/lib/validators";
import { BookingError, type ActionResult } from "@/lib/errors";
import {
  kstHourOf,
  parseKstDate,
  weekdayOf,
} from "@/lib/slots";
import { ReservationStatus, Role } from "@/generated/prisma/enums";

export async function adminSetTeacherAvailability(input: {
  teacherId: string;
  entries: {
    weekday: import("@/generated/prisma/enums").Weekday;
    hours: number[];
  }[];
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return { ok: false, message: "관리자 권한이 필요합니다." };
    }
    const parsed = availabilitySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    await prisma.$transaction([
      prisma.teacherAvailability.deleteMany({
        where: { teacherId: parsed.data.teacherId },
      }),
      prisma.teacherAvailability.createMany({
        data: parsed.data.entries.map((e) => ({
          teacherId: parsed.data.teacherId,
          weekday: e.weekday,
          hours: [...e.hours].sort((a, b) => a - b),
        })),
      }),
    ]);

    revalidatePath(`/admin/teachers/${input.teacherId}/availability`);
    revalidatePath("/admin/members");
    revalidatePath("/student/book");
    revalidatePath("/admin/reservations");
    revalidatePath("/teacher/peek");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "가용 요일 저장 실패",
    };
  }
}

function revalidateSchedule(teacherId: string) {
  revalidatePath(`/admin/teachers/${teacherId}/availability`);
  revalidatePath("/admin/members");
  revalidatePath("/student/book");
  revalidatePath("/admin/reservations");
  revalidatePath("/teacher/peek");
}

/** 예약 시각이 유효 시간에 모두 포함되는지 검사. 벗어난 예약이 있으면 BookingError. */
function assertNoOrphanReservations(
  reservations: { slotDatetime: Date }[],
  allowedHours: number[],
) {
  const allowed = new Set(allowedHours);
  const conflicts = reservations
    .map((r) => kstHourOf(r.slotDatetime))
    .filter((h) => !allowed.has(h))
    .sort((a, b) => a - b);
  if (conflicts.length > 0) {
    const list = [...new Set(conflicts)].map((h) => `${h}시`).join(", ");
    throw new BookingError(
      `이미 예약이 있는 시간(${list})은 비울 수 없습니다. 먼저 해당 예약을 옮기거나 취소해주세요.`,
    );
  }
}

/** 특정 날짜의 요일 기본 스케줄을 덮어쓰는 예외를 저장(upsert). hours 빈 배열 = 휴무. */
export async function adminSetTeacherScheduleException(input: {
  teacherId: string;
  date: string; // YYYY-MM-DD (KST)
  hours: number[];
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return { ok: false, message: "관리자 권한이 필요합니다." };
    }
    const parsed = scheduleExceptionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const { teacherId, date, hours } = parsed.data;
    const sortedHours = [...hours].sort((a, b) => a - b);
    const dayStart = parseKstDate(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // 기존 ACTIVE 예약이 새 유효 시간에서 벗어나면 저장 차단.
      const reservations = await tx.reservation.findMany({
        where: {
          teacherId,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: dayStart, lt: dayEnd },
        },
        select: { slotDatetime: true },
      });
      assertNoOrphanReservations(reservations, sortedHours);

      await tx.teacherScheduleException.upsert({
        where: { teacherId_date: { teacherId, date: dayStart } },
        create: { teacherId, date: dayStart, hours: sortedHours },
        update: { hours: sortedHours },
      });
    });

    revalidateSchedule(teacherId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "날짜 예외 저장 실패",
    };
  }
}

/** 날짜 예외를 삭제하여 요일 기본값으로 복귀. 복귀 후 미아 예약이 생기면 차단. */
export async function adminClearTeacherScheduleException(input: {
  teacherId: string;
  date: string; // YYYY-MM-DD (KST)
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return { ok: false, message: "관리자 권한이 필요합니다." };
    }
    const parsed = scheduleExceptionClearSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const { teacherId, date } = parsed.data;
    const dayStart = parseKstDate(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekday = weekdayOf(dayStart);

    await prisma.$transaction(async (tx) => {
      // 복귀 대상인 요일 기본값을 조회.
      const defaultRow = await tx.teacherAvailability.findUnique({
        where: { teacherId_weekday: { teacherId, weekday } },
      });
      const defaultHours = defaultRow?.hours ?? [];

      const reservations = await tx.reservation.findMany({
        where: {
          teacherId,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: dayStart, lt: dayEnd },
        },
        select: { slotDatetime: true },
      });
      assertNoOrphanReservations(reservations, defaultHours);

      await tx.teacherScheduleException.deleteMany({
        where: { teacherId, date: dayStart },
      });
    });

    revalidateSchedule(teacherId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "날짜 예외 삭제 실패",
    };
  }
}
