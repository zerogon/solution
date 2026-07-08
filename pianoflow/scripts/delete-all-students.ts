/**
 * 관리자·선생님을 제외한 모든 STUDENT 계정 삭제
 *
 *   npx tsx scripts/delete-all-students.ts --dry-run   # 삭제 대상 확인
 *   npx tsx scripts/delete-all-students.ts             # 실제 삭제
 *
 * FK 안전 순서로 의존 레코드(크레딧로그·예약)를 먼저 지운다.
 * (teacher_availability, announcement_reads는 onDelete: Cascade라 자동 정리)
 * ADMIN / TEACHER 계정과 그들의 데이터는 건드리지 않는다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);

  if (ids.length === 0) {
    console.log("ℹ️  STUDENT 계정이 없습니다. 할 일 없음.");
    return;
  }

  const creditLogs = await prisma.lessonCreditLog.count({
    where: { OR: [{ studentId: { in: ids } }, { actorId: { in: ids } }] },
  });
  const reservations = await prisma.reservation.count({ where: { studentId: { in: ids } } });
  const authored = await prisma.announcement.count({ where: { authorId: { in: ids } } });

  if (dryRun) {
    console.log(`🔎 [dry-run] 삭제 대상: 학생 ${ids.length}명`);
    console.log(`   함께 삭제/정리될 의존 레코드 — 크레딧로그 ${creditLogs}건, 예약 ${reservations}건, 학생 작성 공지 ${authored}건(authorId만 null 처리)`);
    console.log("   실제 삭제는 --dry-run 없이 실행하세요.");
    return;
  }

  // 학생이 작성한 공지가 있으면 FK 제약을 피하려 authorId만 null 처리(공지 본문은 유지)
  if (authored > 0) {
    await prisma.announcement.updateMany({
      where: { authorId: { in: ids } },
      data: { authorId: null },
    });
  }

  const cl = await prisma.lessonCreditLog.deleteMany({
    where: { OR: [{ studentId: { in: ids } }, { actorId: { in: ids } }] },
  });
  const rv = await prisma.reservation.deleteMany({ where: { studentId: { in: ids } } });
  const us = await prisma.user.deleteMany({ where: { role: Role.STUDENT } });

  console.log("✅ 학생 데이터 삭제 완료");
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
