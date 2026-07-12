import { prisma } from "@/lib/prisma";
import type { Prisma, RecurringReservation } from "@/generated/prisma/client";
import {
  CreditChangeReason,
  ReservationStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import { isPrismaUniqueViolation } from "@/lib/errors";
import {
  bookingHorizon,
  formatKstDate,
  parseKstDate,
  slotDatetime,
  weekdayOf,
} from "@/lib/slots";

type Tx = Prisma.TransactionClient;

/**
 * 특정 날짜의 유효 예약 가능 시각을 결정. 날짜 예외가 있으면 요일 기본값을 완전히 덮어쓴다.
 * createReservationAction과 고정 예약 실체화가 공유하는 단일 소스.
 */
export async function resolveEffectiveHours(
  tx: Tx,
  teacherId: string,
  dateStr: string,
): Promise<number[]> {
  const dayStart = parseKstDate(dateStr);
  const exception = await tx.teacherScheduleException.findUnique({
    where: { teacherId_date: { teacherId, date: dayStart } },
  });
  if (exception) return exception.hours;
  const availabilityRow = await tx.teacherAvailability.findUnique({
    where: { teacherId_weekday: { teacherId, weekday: weekdayOf(dayStart) } },
  });
  return availabilityRow?.hours ?? [];
}

export type SkipReason =
  | "NO_AVAILABILITY" // 그 주 선생님 휴무/해당 시간 제거
  | "STUDENT_INACTIVE" // 학생 DORMANT/WITHDRAWN
  | "ENROLLMENT_OUT" // 등록 기간 밖
  | "DUPLICATE" // 학생이 이미 그 시각에 예약 보유
  | "CANCELLED" // 이 템플릿의 회차를 학생이 취소함(부활 금지 tombstone)
  | "SLOT_TAKEN"; // 선생님 슬롯을 타인이 선점(부분 유니크 P2002)

export interface MaterializeSkip {
  templateId: string;
  dateStr: string;
  reason: SkipReason;
}

export interface MaterializeCreated {
  templateId: string;
  dateStr: string;
}

export interface MaterializeResult {
  created: MaterializeCreated[];
  skipped: MaterializeSkip[];
}

/** fromStr..toStr(포함) KST 일자 문자열 목록 */
function eachDateStr(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  let cur = parseKstDate(fromStr).getTime();
  const end = parseKstDate(toStr).getTime();
  while (cur <= end) {
    out.push(formatKstDate(new Date(cur)));
    cur += 86400000;
  }
  return out;
}

/**
 * 고정 예약 템플릿 한 건을 특정 날짜에 실체화(개별 트랜잭션).
 * createReservationAction 트랜잭션 내부의 검증/크레딧 규칙을 축소 재현한다.
 * @returns skip 사유. 정상 생성이면 null.
 */
async function materializeOne(
  tx: Tx,
  tpl: Pick<
    RecurringReservation,
    "id" | "teacherId" | "studentId" | "hour" | "createdBy"
  >,
  dateStr: string,
): Promise<SkipReason | null> {
  const hours = await resolveEffectiveHours(tx, tpl.teacherId, dateStr);
  if (!hours.includes(tpl.hour)) return "NO_AVAILABILITY";

  const student = await tx.user.findUnique({ where: { id: tpl.studentId } });
  if (!student || student.status !== UserStatus.ACTIVE) {
    return "STUDENT_INACTIVE";
  }

  const slot = slotDatetime(dateStr, tpl.hour);
  const slotDayStart = parseKstDate(dateStr);
  if (
    student.enrollmentStart &&
    slotDayStart.getTime() < student.enrollmentStart.getTime()
  ) {
    return "ENROLLMENT_OUT";
  }
  if (
    student.enrollmentEnd &&
    slot.getTime() >= student.enrollmentEnd.getTime() + 24 * 60 * 60 * 1000
  ) {
    return "ENROLLMENT_OUT";
  }

  // 같은 학생이 같은 시각에 이미 예약을 가지고 있으면 스킵(다른 선생님과의 중복 포함).
  // 이 템플릿에서 실체화됐다가 취소된 회차(tombstone)도 스킵 — 포인터 리셋 후
  // 재실체화가 학생의 개별 취소를 되살려 크레딧을 재차감하는 것을 막는다.
  // 수동 예약의 취소는 tombstone이 아니다(recurringId 없음).
  const dup = await tx.reservation.findFirst({
    where: {
      slotDatetime: slot,
      OR: [
        { studentId: student.id, status: ReservationStatus.ACTIVE },
        { recurringId: tpl.id, status: ReservationStatus.CANCELLED },
      ],
    },
  });
  if (dup) {
    return dup.status === ReservationStatus.CANCELLED
      ? "CANCELLED"
      : "DUPLICATE";
  }

  // 선생님 슬롯 선점 시 partial unique가 P2002 → 호출부에서 SLOT_TAKEN으로 처리
  const created = await tx.reservation.create({
    data: {
      teacherId: tpl.teacherId,
      studentId: student.id,
      slotDatetime: slot,
      status: ReservationStatus.ACTIVE,
      forcedByAdmin: false,
      recurringId: tpl.id,
    },
  });

  // 크레딧: 남은 횟수가 있으면 차감, 0이면 예약만 생성(admin-force와 동일 규칙)
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
        actorId: tpl.createdBy,
        reservationId: created.id,
      },
    });
  }

  return null;
}

/**
 * 활성 고정 예약을 현재 예약 창(bookingHorizon) 안에서 멱등 실체화한다.
 * - 정확성: (teacher_id, slot_datetime) WHERE status=ACTIVE 부분 유니크가 중복 생성을 물리적으로 차단.
 * - 성능: materializedUntil 포인터로 이미 시도한 날짜는 재방문하지 않음.
 * 각 회차는 개별 트랜잭션(Postgres에서 P2002는 트랜잭션 전체를 abort하므로 루프 내 catch 불가).
 */
export async function materializeRecurringReservations(
  now: Date = new Date(),
): Promise<MaterializeResult> {
  const { minDateStr, maxDateStr } = bookingHorizon(now);
  const maxDate = parseKstDate(maxDateStr);

  const templates = await prisma.recurringReservation.findMany({
    where: {
      active: true,
      OR: [{ materializedUntil: null }, { materializedUntil: { lt: maxDate } }],
    },
  });

  const created: MaterializeCreated[] = [];
  const skipped: MaterializeSkip[] = [];

  for (const tpl of templates) {
    // 이미 시도한 날짜(materializedUntil 이하)는 건너뛴다. 하한은 항상 내일(minDateStr).
    const alreadyStr = tpl.materializedUntil
      ? formatKstDate(tpl.materializedUntil)
      : null;
    const dates = eachDateStr(minDateStr, maxDateStr).filter(
      (d) =>
        weekdayOf(parseKstDate(d)) === tpl.weekday &&
        (!alreadyStr || d > alreadyStr),
    );

    for (const dateStr of dates) {
      try {
        const skip = await prisma.$transaction((tx) =>
          materializeOne(tx, tpl, dateStr),
        );
        if (skip) skipped.push({ templateId: tpl.id, dateStr, reason: skip });
        else created.push({ templateId: tpl.id, dateStr });
      } catch (err) {
        if (isPrismaUniqueViolation(err)) {
          skipped.push({ templateId: tpl.id, dateStr, reason: "SLOT_TAKEN" });
        } else {
          throw err;
        }
      }
    }

    // 포인터 전진: 이 창 상한까지 시도 완료. (일시적 사유로 skip된 회차는 재시도하지 않음)
    await prisma.recurringReservation.update({
      where: { id: tpl.id },
      data: { materializedUntil: maxDate },
    });
  }

  return { created, skipped };
}

/**
 * 실체화 조건이 바뀌었을 때(등록 기간 연장, 스케줄 예외 변경, 회원 재활성화)
 * 해당 템플릿들의 포인터를 리셋해 현재 창을 처음부터 재시도하게 한다.
 * 재시도해도 DUPLICATE 체크 + 부분 유니크(P2002)가 중복 생성을 막고,
 * 학생이 취소한 회차는 CANCELLED tombstone이 부활을 막으므로 안전.
 */
export async function resetMaterialization(where: {
  studentId?: string;
  teacherId?: string;
}): Promise<void> {
  await prisma.recurringReservation.updateMany({
    where: { ...where, active: true },
    data: { materializedUntil: null },
  });
}

/**
 * 읽기 경로용 저비용 가드. 채울 게 없으면(평상시) write 없이 즉시 반환.
 * cron이 놓치거나 로컬 개발 시 새 주차 예약이 즉시 보이도록 fallback.
 */
export async function ensureRecurringMaterialized(
  now: Date = new Date(),
): Promise<void> {
  const { maxDateStr } = bookingHorizon(now);
  const maxDate = parseKstDate(maxDateStr);
  const pending = await prisma.recurringReservation.count({
    where: {
      active: true,
      OR: [{ materializedUntil: null }, { materializedUntil: { lt: maxDate } }],
    },
  });
  if (pending === 0) return;
  await materializeRecurringReservations(now);
}
