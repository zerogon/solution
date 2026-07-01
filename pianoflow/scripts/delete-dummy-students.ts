/**
 * 더미 학생 50명 삭제 (seed-dummy-students.ts로 만든 데이터 정리)
 *
 *   npx tsx scripts/delete-dummy-students.ts --dry-run   # 삭제 대상 확인
 *   npx tsx scripts/delete-dummy-students.ts             # 삭제 실행
 *
 * 대상: 전화가 "010-0050-"로 시작하는 STUDENT 행.
 * FK 안전 순서로 의존 레코드(예약/크레딧)를 먼저 지운다.
 * (teacher_availability, announcement_reads는 onDelete: Cascade라 자동 정리)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PHONE_PREFIX = "010-0050-";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const targets = await prisma.user.findMany({
    where: { phone: { startsWith: PHONE_PREFIX }, role: Role.STUDENT },
    select: { id: true },
  });
  const ids = targets.map((t) => t.id);

  if (ids.length === 0) {
    console.log(`ℹ️  "${PHONE_PREFIX}*" 더미 학생이 없습니다. 할 일 없음.`);
    return;
  }

  if (dryRun) {
    const creditLogs = await prisma.lessonCreditLog.count({ where: { studentId: { in: ids } } });
    const reservations = await prisma.reservation.count({ where: { studentId: { in: ids } } });
    console.log(`🔎 [dry-run] 삭제 대상: 학생 ${ids.length}명`);
    console.log(`   함께 삭제될 의존 레코드 — 크레딧로그 ${creditLogs}건, 예약 ${reservations}건`);
    console.log("   실제 삭제는 --dry-run 없이 실행하세요.");
    return;
  }

  const cl = await prisma.lessonCreditLog.deleteMany({ where: { studentId: { in: ids } } });
  const rv = await prisma.reservation.deleteMany({ where: { studentId: { in: ids } } });
  const us = await prisma.user.deleteMany({
    where: { phone: { startsWith: PHONE_PREFIX }, role: Role.STUDENT },
  });

  console.log(`✅ 더미 학생 삭제 완료`);
  console.log(`   학생 ${us.count}명 / 크레딧로그 ${cl.count}건 / 예약 ${rv.count}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
