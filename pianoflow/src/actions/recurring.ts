"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isPrismaUniqueViolation,
  type ActionResult,
} from "@/lib/errors";
import {
  recurringCreateSchema,
  recurringDeleteSchema,
  recurringIdSchema,
} from "@/lib/validators";
import {
  materializeRecurringReservations,
  type SkipReason,
} from "@/lib/recurring";
import {
  CreditChangeReason,
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    throw new Error("관리자 권한이 필요합니다.");
  }
  return session;
}

function revalidateRecurring(studentId: string) {
  revalidatePath("/student");
  revalidatePath("/student/book");
  revalidatePath("/teacher");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/members/${studentId}`);
}

export async function createRecurringAction(input: {
  studentId: string;
  teacherId: string;
  weekday: import("@/generated/prisma/enums").Weekday;
  hour: number;
}): Promise<
  ActionResult<{
    created: number;
    skipped: { dateStr: string; reason: SkipReason }[];
  }>
> {
  try {
    const session = await requireAdmin();
    const parsed = recurringCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }
    const { studentId, teacherId, weekday, hour } = parsed.data;

    const [teacher, student, availability] = await Promise.all([
      prisma.user.findUnique({ where: { id: teacherId } }),
      prisma.user.findUnique({ where: { id: studentId } }),
      prisma.teacherAvailability.findUnique({
        where: { teacherId_weekday: { teacherId, weekday } },
      }),
    ]);
    if (!teacher || teacher.role !== Role.TEACHER) {
      return { ok: false, message: "선택한 선생님을 찾을 수 없습니다." };
    }
    if (!student || student.role !== Role.STUDENT) {
      return { ok: false, message: "학생 정보를 확인할 수 없습니다." };
    }
    if (student.status !== UserStatus.ACTIVE) {
      return { ok: false, message: "활성 상태의 회원만 고정 예약할 수 있습니다." };
    }
    // 등록 기간이 이미 끝난 학생은 모든 회차가 스킵되므로 등록 자체를 차단
    // (일반 예약의 등록 기간 규칙과 동일: 종료일 당일까지 허용)
    if (
      student.enrollmentEnd &&
      Date.now() >= student.enrollmentEnd.getTime() + 24 * 60 * 60 * 1000
    ) {
      return {
        ok: false,
        message:
          "등록 기간이 종료되어 고정 예약을 등록할 수 없습니다. 등록 기간을 먼저 연장해주세요.",
      };
    }
    // 요일 기본 스케줄에 그 시간이 없으면 실체화되지 않으므로 등록 차단
    if (!availability || !availability.hours.includes(hour)) {
      return {
        ok: false,
        message:
          "선생님의 해당 요일·시간이 예약 가능 시간으로 설정되어 있지 않습니다. 먼저 선생님 스케줄을 확인해주세요.",
      };
    }

    const template = await prisma.recurringReservation.create({
      data: {
        teacherId,
        studentId,
        weekday,
        hour,
        createdBy: session.user.id,
      },
    });

    // 등록 즉시 현재 예약 창을 채운다. 결과는 이 템플릿 것만 골라 반환.
    const result = await materializeRecurringReservations(new Date());
    const created = result.created.filter(
      (c) => c.templateId === template.id,
    ).length;
    const skipped = result.skipped
      .filter((s) => s.templateId === template.id)
      .map(({ dateStr, reason }) => ({ dateStr, reason }));

    revalidateRecurring(studentId);
    return { ok: true, data: { created, skipped } };
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      return {
        ok: false,
        message: "이미 같은 선생님·요일·시간의 고정 예약이 있습니다.",
      };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "고정 예약 등록 실패",
    };
  }
}

export async function deactivateRecurringAction(input: {
  id: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = recurringIdSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }
    // 이미 만들어진 미래 예약은 유지, 신규 생성만 중단
    const tpl = await prisma.recurringReservation.update({
      where: { id: parsed.data.id },
      data: { active: false },
      select: { studentId: true },
    });
    revalidateRecurring(tpl.studentId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "고정 예약 해제 실패",
    };
  }
}

export async function deleteRecurringAction(input: {
  id: string;
  cancelFuture: boolean;
}): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const parsed = recurringDeleteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }
    const { id, cancelFuture } = parsed.data;

    const tpl = await prisma.recurringReservation.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!tpl) {
      return { ok: false, message: "고정 예약을 찾을 수 없습니다." };
    }

    await prisma.$transaction(async (tx) => {
      if (cancelFuture) {
        const now = new Date();
        const future = await tx.reservation.findMany({
          where: {
            recurringId: id,
            status: ReservationStatus.ACTIVE,
            slotDatetime: { gte: now },
          },
          select: { id: true, studentId: true },
        });
        for (const r of future) {
          await tx.reservation.update({
            where: { id: r.id },
            data: {
              status: ReservationStatus.CANCELLED,
              cancelledAt: now,
              cancelledBy: session.user.id,
            },
          });
          // 예약 시 차감됐던 크레딧을 로그 기준으로 복구
          const reserveLog = await tx.lessonCreditLog.findFirst({
            where: { reservationId: r.id, reason: CreditChangeReason.RESERVE },
          });
          if (reserveLog) {
            await tx.user.update({
              where: { id: r.studentId },
              data: { remainingLessons: { increment: 1 } },
            });
            await tx.lessonCreditLog.create({
              data: {
                studentId: r.studentId,
                delta: 1,
                reason: CreditChangeReason.CANCEL,
                actorId: session.user.id,
                reservationId: r.id,
              },
            });
          }
        }
      }
      // cancelFuture=false면 FK가 recurring_id를 SetNull → 미래 예약은 남고 고정 배지만 사라짐
      await tx.recurringReservation.delete({ where: { id } });
    });

    revalidateRecurring(tpl.studentId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "고정 예약 삭제 실패",
    };
  }
}
