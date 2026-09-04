/**
 * 동시 신청 방지 검증.
 *
 * 같은 직원·같은 날짜에 10개의 `createLeaveRequest`를 동시에 던져 **정확히 1건**만
 * 통과하는지 확인한다. 나머지 9건은 (a) balance 행 FOR UPDATE 직렬화 뒤 findFirst에
 * 걸린 LeaveError 또는 (b) 그 틈을 뚫었더라도 유니크 제약(P2002)이어야 한다.
 *
 *   npm run race-test    (assert-local-db 가드 뒤에서만 돈다)
 */
import "./load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { EmployeeStatus, LeaveStatus, LeaveType, Role } from "../src/generated/prisma/enums.js";
import { createLeaveRequest } from "../src/lib/leave-service";
import { LeaveError, isPrismaUniqueViolation } from "../src/lib/errors";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE, branchId: { not: null } },
    include: { branch: true },
  });
  if (!user?.branch) throw new Error("재직 직원이 없습니다. seed를 먼저 실행하세요.");

  // 충돌 날짜: 40일 뒤 — 지점 휴무 요일이면 하루씩 민다.
  const d = new Date(Date.now() + 40 * 86_400_000);
  while (user.branch.closedWeekdays.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const iso = d.toISOString().slice(0, 10);

  // 그 날짜의 기존 활성 신청 정리
  const stale = await prisma.leaveRequestDay.findMany({
    where: { userId: user.id, date: new Date(`${iso}T00:00:00.000Z`) },
    select: { leaveRequestId: true },
  });
  for (const s of stale) {
    await prisma.leaveRequestDay.deleteMany({ where: { leaveRequestId: s.leaveRequestId } });
    await prisma.leaveRequest.update({ where: { id: s.leaveRequestId }, data: { status: LeaveStatus.CANCELLED } });
  }

  console.log(`🏁 ${user.name}(${user.branch.name}) / ${iso} 에 10건 동시 신청`);

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      createLeaveRequest(prisma, {
        userId: user.id,
        type: LeaveType.FULL_DAY,
        startIso: iso,
        endIso: iso,
        reason: `race-test #${i}`,
      }),
    ),
  );

  let success = 0, domain = 0, unique = 0, other = 0;
  const created: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      success += 1;
      created.push(r.value.id);
    } else if (r.reason instanceof LeaveError) domain += 1;
    else if (isPrismaUniqueViolation(r.reason)) unique += 1;
    else {
      other += 1;
      console.error("  기타:", r.reason);
    }
  }

  const rows = await prisma.leaveRequestDay.count({
    where: { userId: user.id, date: new Date(`${iso}T00:00:00.000Z`) },
  });

  console.log(`✅ 성공: ${success}`);
  console.log(`🛑 LeaveError(직렬화 후 중복 감지): ${domain}`);
  console.log(`🛑 P2002(유니크 위반): ${unique}`);
  console.log(`⚠️  기타: ${other}`);
  console.log(`📦 leave_request_days 행 수: ${rows}`);

  // 정리
  for (const id of created) {
    await prisma.leaveRequestDay.deleteMany({ where: { leaveRequestId: id } });
    await prisma.leaveRequest.delete({ where: { id } });
  }

  const ok = success === 1 && rows === 1 && other === 0;
  console.log(ok ? "\n🎉 PASS" : "\n❌ FAIL");
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
