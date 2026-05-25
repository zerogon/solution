/**
 * 동시 예약 방지 검증:
 * 같은 선생님/시간에 10개 동시 INSERT를 시도하면
 * 부분 유니크 인덱스(reservation_teacher_slot_active_uniq)가
 * 정확히 1건만 통과시키는지 확인합니다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  ReservationStatus,
  Role,
} from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const teacher = await prisma.user.findFirst({
    where: { role: Role.TEACHER },
  });
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT },
    take: 10,
  });
  if (!teacher || students.length < 1) {
    throw new Error("선생님/학생 데이터가 부족합니다. seed를 먼저 실행하세요.");
  }

  // 충돌 슬롯: 내일 오전 11시 (KST)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(11 - 9, 0, 0, 0); // 11 KST = 02 UTC
  const slot = tomorrow;

  // 동일 슬롯의 기존 ACTIVE 예약 모두 정리
  await prisma.reservation.updateMany({
    where: {
      teacherId: teacher.id,
      slotDatetime: slot,
      status: ReservationStatus.ACTIVE,
    },
    data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
  });

  console.log(
    `🏁 ${teacher.name} 선생님 / ${slot.toISOString()} 슬롯에 ${students.length}명 동시 INSERT 시도`,
  );

  const results = await Promise.allSettled(
    students.map((s) =>
      prisma.reservation.create({
        data: {
          teacherId: teacher.id,
          studentId: s.id,
          slotDatetime: slot,
          status: ReservationStatus.ACTIVE,
        },
      }),
    ),
  );

  let success = 0;
  let unique = 0;
  let other = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      success += 1;
    } else {
      const code = (r.reason as { code?: string }).code;
      if (code === "P2002") unique += 1;
      else other += 1;
    }
  }

  console.log(`✅ 성공: ${success}`);
  console.log(`🛑 P2002(유니크 위반): ${unique}`);
  console.log(`⚠️  기타 에러: ${other}`);

  const active = await prisma.reservation.count({
    where: {
      teacherId: teacher.id,
      slotDatetime: slot,
      status: ReservationStatus.ACTIVE,
    },
  });
  console.log(`📊 DB의 ACTIVE 예약 수: ${active}`);

  if (success === 1 && active === 1) {
    console.log("\n🎉 동시 예약 방지 검증 통과");
  } else {
    console.log("\n❌ 검증 실패 — 동시 예약 보호가 동작하지 않습니다.");
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
