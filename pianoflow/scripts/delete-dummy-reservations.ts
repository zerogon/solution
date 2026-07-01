/**
 * 더미 학생 50명의 예약 데이터 삭제 (seed-dummy-reservations.ts의 역연산)
 *
 *   npx tsx scripts/delete-dummy-reservations.ts --dry-run   # 삭제 대상 확인
 *   npx tsx scripts/delete-dummy-reservations.ts             # 삭제 + 크레딧 복원
 *
 * 대상: 전화가 "010-0050-"로 시작하는 STUDENT의 예약/크레딧로그.
 * 학생 remainingLessons는 seed-dummy-students.ts 초기값(4)으로 복원한다.
 * (학생 계정 자체는 유지 — 계정까지 지우려면 delete-dummy-students.ts 사용)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PHONE_PREFIX = "010-0050-";
const RESTORE_CREDITS = 4; // seed-dummy-students.ts 초기값

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const students = await prisma.user.findMany({
    where: { phone: { startsWith: PHONE_PREFIX }, role: Role.STUDENT },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  if (ids.length === 0) {
    console.log(`ℹ️  "${PHONE_PREFIX}*" 더미 학생이 없습니다. 할 일 없음.`);
    return;
  }

  const reservations = await prisma.reservation.count({ where: { studentId: { in: ids } } });
  const creditLogs = await prisma.lessonCreditLog.count({ where: { studentId: { in: ids } } });

  if (dryRun) {
    console.log(`🔎 [dry-run] 삭제 대상: 더미 학생 ${ids.length}명`);
    console.log(`   예약 ${reservations}건, 크레딧로그 ${creditLogs}건`);
    console.log(`   삭제 후 학생 remainingLessons → ${RESTORE_CREDITS} 로 복원`);
    console.log("   실제 삭제는 --dry-run 없이 실행하세요.");
    return;
  }

  const c = await prisma.lessonCreditLog.deleteMany({ where: { studentId: { in: ids } } });
  const r = await prisma.reservation.deleteMany({ where: { studentId: { in: ids } } });
  const u = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { remainingLessons: RESTORE_CREDITS },
  });

  console.log(`✅ 더미 예약 삭제 완료`);
  console.log(`   예약 ${r.count}건 / 크레딧로그 ${c.count}건 삭제, 학생 ${u.count}명 크레딧 ${RESTORE_CREDITS}로 복원`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
