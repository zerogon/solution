/**
 * 고정 예약 tombstone 검증 스크립트 (로컬 DB 전용, 일회성).
 * ① 템플릿 실체화 → 창 안 회차 생성 + 크레딧 차감
 * ② 미래 회차 1건 취소(크레딧 복원) 후 resetMaterialization → 재실체화
 *    → 취소 회차가 부활하지 않고(CANCELLED 스킵) 크레딧 불변
 * ③ 회귀: 취소 없는 템플릿은 리셋 후 전부 DUPLICATE 스킵, 신규 생성/차감 없음
 */
import "./load-env";
import { prisma } from "../src/lib/prisma";
import {
  materializeRecurringReservations,
  resetMaterialization,
} from "../src/lib/recurring";
import {
  CreditChangeReason,
  ReservationStatus,
  Role,
  UserStatus,
  Weekday,
} from "../src/generated/prisma/enums";
import { bookingHorizon, parseKstDate, weekdayOf } from "../src/lib/slots";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "✅" : "❌"} ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  );
  if (!ok) failures += 1;
}

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`로컬 DB가 아닙니다: ${host}`);
  }

  const tag = `tombstone-test-${Date.now()}`;
  const teacher = await prisma.user.create({
    data: {
      name: "톰스톤검증선생",
      phone: `098-${Date.now() % 10000000}`,
      loginId: `${tag}-t`,
      password: "x",
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
    },
  });
  const student = await prisma.user.create({
    data: {
      name: "톰스톤검증학생",
      phone: `097-${Date.now() % 10000000}`,
      loginId: `${tag}-s`,
      password: "x",
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      remainingLessons: 10,
    },
  });
  // 모든 요일 10시 가용
  for (const wd of Object.values(Weekday)) {
    await prisma.teacherAvailability.create({
      data: { teacherId: teacher.id, weekday: wd, hours: [10] },
    });
  }

  const now = new Date();
  const { minDateStr } = bookingHorizon(now);
  const weekday = weekdayOf(parseKstDate(minDateStr)); // 창 첫날 요일 → 회차 최소 1개 보장

  const tpl = await prisma.recurringReservation.create({
    data: {
      teacherId: teacher.id,
      studentId: student.id,
      weekday,
      hour: 10,
      active: true,
    },
  });

  // ① 최초 실체화
  const r1 = await materializeRecurringReservations(now);
  const createdCount = r1.created.filter((c) => c.templateId === tpl.id).length;
  check("① 회차 생성됨(1개 이상)", createdCount >= 1, true);
  let s = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
  check("① 크레딧 차감", s.remainingLessons, 10 - createdCount);

  // ② 첫 회차 취소 (앱의 취소 로직 재현: 상태 변경 + RESERVE 있으면 복원)
  const victim = await prisma.reservation.findFirstOrThrow({
    where: { recurringId: tpl.id, status: ReservationStatus.ACTIVE },
    orderBy: { slotDatetime: "asc" },
  });
  await prisma.reservation.update({
    where: { id: victim.id },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledBy: student.id,
    },
  });
  await prisma.user.update({
    where: { id: student.id },
    data: { remainingLessons: { increment: 1 } },
  });
  await prisma.lessonCreditLog.create({
    data: {
      studentId: student.id,
      delta: 1,
      reason: CreditChangeReason.CANCEL,
      reservationId: victim.id,
    },
  });
  const afterCancel = 10 - createdCount + 1;

  await resetMaterialization({ studentId: student.id });
  const r2 = await materializeRecurringReservations(now);
  const mySkips = r2.skipped.filter((k) => k.templateId === tpl.id);
  check(
    "② 취소 회차는 CANCELLED 스킵",
    mySkips.some((k) => k.reason === "CANCELLED"),
    true,
  );
  check(
    "② 부활한 ACTIVE 예약 없음",
    await prisma.reservation.count({
      where: {
        recurringId: tpl.id,
        slotDatetime: victim.slotDatetime,
        status: ReservationStatus.ACTIVE,
      },
    }),
    0,
  );
  check(
    "② 신규 생성 0건",
    r2.created.filter((c) => c.templateId === tpl.id).length,
    0,
  );
  s = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
  check("② 크레딧 재차감 없음", s.remainingLessons, afterCancel);

  // ③ 회귀: 나머지 회차는 DUPLICATE 스킵 (취소 회차 외 전부)
  check(
    "③ 나머지 회차 DUPLICATE 스킵",
    mySkips.filter((k) => k.reason === "DUPLICATE").length,
    createdCount - 1,
  );
  // 한 번 더 리셋해도 결과 동일(멱등)
  await resetMaterialization({ studentId: student.id });
  const r3 = await materializeRecurringReservations(now);
  check(
    "③ 재리셋에도 생성 0건",
    r3.created.filter((c) => c.templateId === tpl.id).length,
    0,
  );
  s = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
  check("③ 크레딧 불변", s.remainingLessons, afterCancel);

  // 정리
  await prisma.lessonCreditLog.deleteMany({ where: { studentId: student.id } });
  await prisma.reservation.deleteMany({ where: { studentId: student.id } });
  await prisma.recurringReservation.deleteMany({ where: { id: tpl.id } });
  await prisma.teacherAvailability.deleteMany({
    where: { teacherId: teacher.id },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [teacher.id, student.id] } },
  });

  console.log(failures === 0 ? "\n모든 검증 통과" : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
