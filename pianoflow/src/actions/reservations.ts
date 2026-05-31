"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BookingError, type ActionResult } from "@/lib/errors";
import {
  reservationCancelSchema,
  reservationCreateSchema,
  reservationVisibilitySchema,
} from "@/lib/validators";
import {
  BOOKING_CLOSE_MIN,
  BOOKING_OPEN_MIN,
  canStudentCancel,
  formatKstDate,
  isSameKstDay,
  kstMinutesOfDay,
  parseKstDate,
  SLOT_HOURS,
  weekdayOf,
} from "@/lib/slots";
import {
  CreditChangeReason,
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

const PRISMA_UNIQUE_VIOLATION = "P2002";

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === PRISMA_UNIQUE_VIOLATION
  );
}

export async function createReservationAction(input: {
  teacherId: string;
  slotIso: string;
  studentId?: string;
}): Promise<ActionResult<{ reservationId: string }>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const parsed = reservationCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const { teacherId, slotIso } = parsed.data;
  const isAdminForce =
    session.user.role === Role.ADMIN && parsed.data.studentId !== undefined;
  const studentId = isAdminForce ? parsed.data.studentId! : session.user.id;

  if (!isAdminForce && session.user.role !== Role.STUDENT) {
    return { ok: false, message: "예약 권한이 없습니다." };
  }

  const slotDate = new Date(slotIso);
  if (Number.isNaN(slotDate.getTime())) {
    return { ok: false, message: "잘못된 시각입니다." };
  }
  if (slotDate.getUTCMinutes() !== 0 || slotDate.getUTCSeconds() !== 0) {
    return { ok: false, message: "시간 단위로만 예약할 수 있습니다." };
  }
  // KST hour 범위 검증
  const kstHour = (slotDate.getUTCHours() + 9) % 24;
  if (!SLOT_HOURS.includes(kstHour as (typeof SLOT_HOURS)[number])) {
    return { ok: false, message: "예약 가능 시간(10시~22시)을 벗어났습니다." };
  }

  if (slotDate.getTime() < Date.now() && !isAdminForce) {
    return { ok: false, message: "지난 시간에는 예약할 수 없습니다." };
  }

  // 당일 예약 불가 + 예약 행위 가능 시각 제한 (학생 한정, 관리자 강제 예약은 우회)
  if (!isAdminForce) {
    const now = new Date();
    if (isSameKstDay(slotDate, now)) {
      return {
        ok: false,
        message: "당일 예약은 불가합니다. 내일 이후 날짜를 선택해주세요.",
      };
    }
    const nowMin = kstMinutesOfDay(now);
    if (nowMin < BOOKING_OPEN_MIN || nowMin > BOOKING_CLOSE_MIN) {
      return {
        ok: false,
        message: "예약은 낮 12시부터 밤 10시 30분 사이에만 가능합니다.",
      };
    }
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const teacher = await tx.user.findUnique({
        where: { id: teacherId },
        include: { availability: true },
      });
      if (!teacher || teacher.role !== Role.TEACHER) {
        throw new BookingError("선택한 선생님을 찾을 수 없습니다.");
      }
      const weekday = weekdayOf(slotDate);
      const availabilityRow = teacher.availability.find(
        (a) => a.weekday === weekday,
      );
      if (!availabilityRow) {
        throw new BookingError("해당 요일은 예약할 수 없는 요일입니다.");
      }
      if (!availabilityRow.hours.includes(kstHour)) {
        throw new BookingError("해당 시간은 예약할 수 없는 시간입니다.");
      }

      const student = await tx.user.findUnique({
        where: { id: studentId },
      });
      if (!student || student.role !== Role.STUDENT) {
        throw new BookingError("학생 정보를 확인할 수 없습니다.");
      }
      if (student.status !== UserStatus.ACTIVE) {
        throw new BookingError("활성 상태의 회원만 예약할 수 있습니다.");
      }
      // 등록 기간 검증 (미설정이면 무제한 허용, 관리자 강제 예약은 우회)
      if (!isAdminForce) {
        const slotDayStart = parseKstDate(formatKstDate(slotDate));
        if (
          student.enrollmentStart &&
          slotDayStart.getTime() < student.enrollmentStart.getTime()
        ) {
          throw new BookingError("등록 기간 시작 전에는 예약할 수 없습니다.");
        }
        if (
          student.enrollmentEnd &&
          slotDate.getTime() >=
            student.enrollmentEnd.getTime() + 24 * 60 * 60 * 1000
        ) {
          throw new BookingError("등록 기간이 종료되어 예약할 수 없습니다.");
        }
      }
      if (student.remainingLessons < 1 && !isAdminForce) {
        throw new BookingError("남은 레슨 횟수가 부족합니다.");
      }

      // 동일 학생이 같은 시간에 다른 선생님과 중복 예약 불가
      const myExisting = await tx.reservation.findFirst({
        where: {
          studentId: student.id,
          slotDatetime: slotDate,
          status: ReservationStatus.ACTIVE,
        },
      });
      if (myExisting) {
        throw new BookingError("같은 시간에 이미 예약이 있습니다.");
      }

      const created = await tx.reservation.create({
        data: {
          teacherId,
          studentId: student.id,
          slotDatetime: slotDate,
          status: ReservationStatus.ACTIVE,
          forcedByAdmin: isAdminForce,
        },
      });

      // 레슨 차감 (관리자 강제 예약 시 옵션으로 차감)
      if (student.remainingLessons > 0) {
        await tx.user.update({
          where: { id: student.id },
          data: { remainingLessons: { decrement: 1 } },
        });
        await tx.lessonCreditLog.create({
          data: {
            studentId: student.id,
            delta: -1,
            reason: CreditChangeReason.RESERVE,
            actorId: session.user.id,
            reservationId: created.id,
          },
        });
      }

      return created;
    });

    revalidatePath("/student");
    revalidatePath("/student/book");
    revalidatePath("/student/history");
    revalidatePath("/teacher");
    revalidatePath("/admin/reservations");

    return { ok: true, data: { reservationId: reservation.id } };
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      return {
        ok: false,
        message: "이미 예약된 시간입니다. 다른 시간을 선택해주세요.",
      };
    }
    if (err instanceof BookingError) {
      return { ok: false, message: err.message };
    }
    console.error("[createReservation]", err);
    return { ok: false, message: "예약 처리에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function cancelReservationAction(input: {
  reservationId: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const parsed = reservationCancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: parsed.data.reservationId },
      });
      if (!reservation) {
        throw new BookingError("예약을 찾을 수 없습니다.");
      }
      if (reservation.status !== ReservationStatus.ACTIVE) {
        throw new BookingError("이미 취소된 예약입니다.");
      }

      const isAdmin = session.user.role === Role.ADMIN;
      const isOwner = reservation.studentId === session.user.id;
      if (!isAdmin && !isOwner) {
        throw new BookingError("본인 예약만 취소할 수 있습니다.");
      }

      // 취소 마감: 레슨 전날 밤 10시 30분(KST)까지. 그 이후·당일은 불가 (관리자는 우회)
      if (!isAdmin && !canStudentCancel(reservation.slotDatetime)) {
        throw new BookingError(
          "취소 마감(레슨 전날 밤 10시 30분)이 지났습니다.",
        );
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: session.user.id,
        },
      });

      // 레슨 복구 (강제 예약이라 차감 안 됐을 수도 있으니 로그 기준)
      const reserveLog = await tx.lessonCreditLog.findFirst({
        where: {
          reservationId: reservation.id,
          reason: CreditChangeReason.RESERVE,
        },
      });
      if (reserveLog) {
        await tx.user.update({
          where: { id: reservation.studentId },
          data: { remainingLessons: { increment: 1 } },
        });
        await tx.lessonCreditLog.create({
          data: {
            studentId: reservation.studentId,
            delta: 1,
            reason: CreditChangeReason.CANCEL,
            actorId: session.user.id,
            reservationId: reservation.id,
          },
        });
      }
    });

    revalidatePath("/student");
    revalidatePath("/student/book");
    revalidatePath("/student/history");
    revalidatePath("/teacher");
    revalidatePath("/admin/reservations");

    return { ok: true };
  } catch (err) {
    if (err instanceof BookingError) {
      return { ok: false, message: err.message };
    }
    console.error("[cancelReservation]", err);
    return { ok: false, message: "예약 취소에 실패했습니다." };
  }
}

export async function adminCancelOverrideAction(input: {
  reservationId: string;
}): Promise<ActionResult> {
  // 관리자 강제 취소 — cancelReservationAction이 ADMIN을 이미 우회 처리
  return cancelReservationAction(input);
}

export async function toggleReservationVisibilityAction(input: {
  reservationId: string;
  isPrivate: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const parsed = reservationVisibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    select: { id: true, studentId: true },
  });
  if (!reservation) {
    return { ok: false, message: "예약을 찾을 수 없습니다." };
  }

  const isAdmin = session.user.role === Role.ADMIN;
  const isOwner = reservation.studentId === session.user.id;
  if (!isAdmin && !isOwner) {
    return { ok: false, message: "본인 예약만 변경할 수 있습니다." };
  }

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { isPrivate: parsed.data.isPrivate },
  });

  revalidatePath("/student");
  revalidatePath("/student/book");
  revalidatePath("/student/history");

  return { ok: true };
}
