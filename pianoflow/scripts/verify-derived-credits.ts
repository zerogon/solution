/**
 * 파생 남은 횟수(reservedFutureCounts) 검증 스크립트 (로컬 DB 전용, 일회성).
 * ① 미래 예약 2건(RESERVE 차감) → reserved=2, 표시값 = 잔액+2
 * ② 잔여 차감 없는 예약(강제/고정 케이스) → reserved 미포함
 * ③ 오늘 슬롯 예약 → reserved 미포함 (당일부터 사용 처리)
 * ④ 취소(복원) → reserved 감소, 표시값 불변
 * ⑤ KST 자정 경계 (23:50 vs 익일 00:10)
 */
import "./load-env";
import { prisma } from "../src/lib/prisma";
import {
  kstTomorrowStart,
  reservedFutureCount,
  reservedFutureCounts,
} from "../src/lib/credits";
import {
  CreditChangeReason,
  ReservationStatus,
  Role,
} from "../src/generated/prisma/enums";
import { formatKstDate, parseKstDate, slotDatetime } from "../src/lib/slots";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✅" : "❌"} ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  if (!ok) failures += 1;
}

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`로컬 DB가 아닙니다: ${host}`);
  }

  const teacher = await prisma.user.findFirst({ where: { role: Role.TEACHER } });
  if (!teacher) throw new Error("선생님 데이터가 없습니다. seed를 먼저 실행하세요.");

  // 독립된 테스트 학생 생성 (잔액 10회)
  const student = await prisma.user.create({
    data: {
      name: "파생검증테스트",
      phone: `099-${Date.now() % 10000000}`,
      loginId: `derived-test-${Date.now()}`,
      password: "x",
      role: Role.STUDENT,
      remainingLessons: 10,
    },
  });

  const now = new Date();
  const todayStr = formatKstDate(now);
  const addDays = (s: string, n: number) =>
    formatKstDate(new Date(parseKstDate(s).getTime() + n * 86_400_000));

  // 앱과 동일한 방식으로 예약 생성 (+옵션 차감/로그)
  async function book(dateStr: string, hour: number, withCredit: boolean) {
    const r = await prisma.reservation.create({
      data: {
        teacherId: teacher!.id,
        studentId: student.id,
        slotDatetime: slotDatetime(dateStr, hour),
        status: ReservationStatus.ACTIVE,
      },
    });
    if (withCredit) {
      await prisma.user.update({
        where: { id: student.id },
        data: { remainingLessons: { decrement: 1 } },
      });
      await prisma.lessonCreditLog.create({
        data: {
          studentId: student.id,
          delta: -1,
          reason: CreditChangeReason.RESERVE,
          reservationId: r.id,
        },
      });
    }
    return r;
  }

  try {
    // 선점 충돌 방지: 이 선생님의 사용할 슬롯 기존 ACTIVE 예약 취소
    const usedSlots = [
      slotDatetime(addDays(todayStr, 1), 21),
      slotDatetime(addDays(todayStr, 2), 21),
      slotDatetime(addDays(todayStr, 3), 21),
      slotDatetime(todayStr, 22),
    ];
    await prisma.reservation.updateMany({
      where: {
        teacherId: teacher.id,
        slotDatetime: { in: usedSlots },
        status: ReservationStatus.ACTIVE,
      },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: now },
    });

    // ① 미래(내일·모레) 예약 2건, 차감 O
    const r1 = await book(addDays(todayStr, 1), 21, true);
    await book(addDays(todayStr, 2), 21, true);
    let me = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    check("① 실잔액 (10-2)", me.remainingLessons, 8);
    check("① reserved (미래 2건)", await reservedFutureCount(student.id, now), 2);
    check("① 표시값 = 잔액+reserved", me.remainingLessons + 2, 10);

    // ② 차감 없는 미래 예약 (잔여 0 강제/고정 케이스) → reserved 불변
    await book(addDays(todayStr, 3), 21, false);
    check("② RESERVE 로그 없는 예약 미포함", await reservedFutureCount(student.id, now), 2);

    // ③ 오늘 슬롯 예약(차감 O) → 당일부터 사용 처리라 reserved 불변
    await book(todayStr, 22, true);
    me = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    check("③ 실잔액 (8-1)", me.remainingLessons, 7);
    check("③ 오늘 예약은 reserved 미포함", await reservedFutureCount(student.id, now), 2);

    // ④ 미래 예약 1건 취소(앱과 동일: 상태 변경 + 복원 + CANCEL 로그)
    await prisma.reservation.update({
      where: { id: r1.id },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: now },
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
        reservationId: r1.id,
      },
    });
    me = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    check("④ 취소 후 실잔액 (7+1)", me.remainingLessons, 8);
    const reserved4 = await reservedFutureCount(student.id, now);
    check("④ 취소 후 reserved (2-1)", reserved4, 1);
    check("④ 표시값 유지 (잔액+reserved, 오늘분 1회만 소진)", me.remainingLessons + reserved4, 9);

    // ⑤ KST 자정 경계: 내일 21시 슬롯은
    //    오늘 23:50(KST)에는 미래(reserved 포함), 내일 00:10(KST)에는 당일(미포함)
    const kst2350 = new Date(parseKstDate(addDays(todayStr, 1)).getTime() - 10 * 60_000);
    const kst0010 = new Date(parseKstDate(addDays(todayStr, 1)).getTime() + 10 * 60_000);
    check("⑤ kstTomorrowStart(23:50) = 내일 0시",
      kstTomorrowStart(kst2350).toISOString(),
      parseKstDate(addDays(todayStr, 1)).toISOString());
    check("⑤ kstTomorrowStart(00:10) = 모레 0시",
      kstTomorrowStart(kst0010).toISOString(),
      parseKstDate(addDays(todayStr, 2)).toISOString());
    // 23:50 기준: 내일 21시(취소됨) 제외, 모레 21시 1건 → 1
    check("⑤ 23:50 기준 reserved", await reservedFutureCount(student.id, kst2350), 1);
    // 익일 00:10 기준: 모레 21시는 여전히 미래 → 1 (내일 21시 취소가 아니었다면 당일 처리로 빠졌을 것)
    check("⑤ 00:10 기준 reserved", await reservedFutureCount(student.id, kst0010), 1);
    // 배치 버전도 동일 결과
    const batch = await reservedFutureCounts([student.id], now);
    check("⑤ 배치 버전 일치", batch.get(student.id) ?? 0, 1);
  } finally {
    // 정리: 테스트 학생의 로그·예약·계정 삭제
    await prisma.lessonCreditLog.deleteMany({ where: { studentId: student.id } });
    await prisma.reservation.deleteMany({ where: { studentId: student.id } });
    await prisma.user.delete({ where: { id: student.id } });
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures}건 실패`);
    process.exit(1);
  }
  console.log("\n✅ 전체 통과");
}

main().finally(() => prisma.$disconnect());
