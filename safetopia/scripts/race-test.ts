/**
 * 동시 신청 방지 검증.
 *
 * 같은 직원·같은 날짜에 10개의 `createLeaveRequest`를 동시에 던져 **정확히 1건**만
 * 통과하는지 확인한다. 나머지 9건은 (a) balance 행 잠금으로 직렬화된 뒤 findFirst에
 * 걸린 LeaveError 또는 (b) 그 틈을 뚫었더라도 유니크 제약(P2002)이어야 한다.
 *
 * 2단계는 **잔액 행이 아직 없는 다음 회차**에 `lockPeriodBalance`를 10개 동시에 던진다 —
 * 지연 생성이 `INSERT ... ON CONFLICT DO UPDATE`로 직렬화돼 행이 정확히 하나만 생기는지 본다.
 * (아직 시작하지 않은 회차는 발생 일수가 0이라 신청으로는 이 경로를 때릴 수 없다.)
 *
 *   npm run race-test    (assert-local-db 가드 뒤에서만 돈다)
 */
import "./load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { EmployeeStatus, LeaveStatus, LeaveType, Role } from "../src/generated/prisma/enums.js";
import { createLeaveRequest } from "../src/lib/leave-service";
import { LeaveError, isPrismaUniqueViolation } from "../src/lib/errors";
import { periodByIndex, periodFor } from "../src/lib/leave-accrual";
import { lockPeriodBalance } from "../src/lib/leave-period";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE, branchId: { not: null } },
    include: { branch: true },
  });
  if (!user?.branch) throw new Error("재직 직원이 없습니다. seed를 먼저 실행하세요.");

  if (!user.hireDate) throw new Error("입사일이 없는 직원입니다. seed를 먼저 실행하세요.");
  const hireIso = user.hireDate.toISOString().slice(0, 10);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const current = periodFor(hireIso, today);

  /** 지점 휴무 요일을 피해 회차 안에 있는 날짜 하나. 회차 끝에 걸리면 거꾸로 민다. */
  function pickDate(from: string, period: { startIso: string; endIso: string }): string {
    const d = new Date(`${from}T00:00:00.000Z`);
    const step = from >= period.endIso ? -1 : 1;
    while (user!.branch!.closedWeekdays.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + step);
    const iso = d.toISOString().slice(0, 10);
    if (iso < period.startIso || iso > period.endIso) {
      throw new Error(`회차(${period.startIso}~${period.endIso}) 안에서 근무일을 찾지 못했습니다.`);
    }
    return iso;
  }

  // 충돌 날짜: 40일 뒤 — 회차를 넘으면 회차 마지막 날부터 거꾸로 찾는다.
  const plus40 = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const iso = pickDate(plus40 > current.endIso ? current.endIso : plus40, current);

  /** 그 날짜의 기존 확정 신청 정리 — 신청이 곧 차감이므로 usedDays도 같이 되돌린다. */
  async function clearStale(dateIso: string) {
    const { index } = periodFor(hireIso, dateIso);
    const stale = await prisma.leaveRequestDay.findMany({
      where: { userId: user!.id, date: new Date(`${dateIso}T00:00:00.000Z`) },
      select: { leaveRequest: { select: { id: true, days: true } } },
    });
    for (const { leaveRequest: r } of stale) {
      await prisma.leaveRequestDay.deleteMany({ where: { leaveRequestId: r.id } });
      await prisma.leaveRequest.update({ where: { id: r.id }, data: { status: LeaveStatus.CANCELLED, cancelledAt: new Date() } });
      await prisma.leaveBalance.updateMany({
        where: { userId: user!.id, periodIndex: index },
        data: { usedDays: { decrement: r.days } },
      });
    }
  }
  await clearStale(iso);

  /** 한 날짜에 10건을 동시에 던지고, 결과를 세고, 흔적을 지운다. */
  async function round(label: string, dateIso: string): Promise<boolean> {
    const { index } = periodFor(hireIso, dateIso);
    console.log(`\n🏁 ${label} — ${user!.name}(${user!.branch!.name}) / ${dateIso} 에 10건 동시 신청`);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createLeaveRequest(prisma, {
          userId: user!.id,
          type: LeaveType.FULL_DAY,
          startIso: dateIso,
          endIso: dateIso,
          reason: `race-test #${i}`,
        }),
      ),
    );

    let success = 0, domain = 0, unique = 0, other = 0;
    const created: { id: string; days: number }[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        success += 1;
        created.push({ id: r.value.id, days: r.value.days });
      } else if (r.reason instanceof LeaveError) domain += 1;
      else if (isPrismaUniqueViolation(r.reason)) unique += 1;
      else {
        other += 1;
        console.error("  기타:", r.reason);
      }
    }

    const rows = await prisma.leaveRequestDay.count({
      where: { userId: user!.id, date: new Date(`${dateIso}T00:00:00.000Z`) },
    });
    // 회차 잔액 행도 정확히 하나여야 한다 — 지연 생성이 직렬화되지 않으면 여기서 드러난다.
    const balances = await prisma.leaveBalance.count({ where: { userId: user!.id, periodIndex: index } });

    console.log(`✅ 성공: ${success}`);
    console.log(`🛑 LeaveError(직렬화 후 중복 감지): ${domain}`);
    console.log(`🛑 P2002(유니크 위반): ${unique}`);
    console.log(`⚠️  기타: ${other}`);
    console.log(`📦 leave_request_days 행 수: ${rows}`);
    console.log(`📦 leave_balances(${index}회차) 행 수: ${balances}`);

    // 정리 — 생성 건 삭제 + 차감분 원복(로컬 잔액이 흐르지 않게).
    for (const { id, days } of created) {
      await prisma.leaveRequestDay.deleteMany({ where: { leaveRequestId: id } });
      await prisma.leaveRequest.delete({ where: { id } });
      await prisma.leaveBalance.updateMany({
        where: { userId: user!.id, periodIndex: index },
        data: { usedDays: { decrement: days } },
      });
    }

    return success === 1 && rows === 1 && balances === 1 && other === 0;
  }

  let ok = await round("1단계: 잔액 행이 이미 있는 회차", iso);

  // 2단계 — 잔액 행이 아직 없는 회차에 지연 생성을 10개 동시에 던진다.
  const nextPeriod = periodByIndex(hireIso, current.index + 1);
  const hasNextRow = await prisma.leaveBalance.count({
    where: { userId: user.id, periodIndex: nextPeriod.index },
  });
  if (hasNextRow > 0) {
    console.log(`\n⏭  2단계 건너뜀 — ${nextPeriod.index}회차 잔액 행이 이미 있습니다.`);
  } else {
    console.log(`\n🏁 2단계 — ${nextPeriod.index}회차(${nextPeriod.startIso}~) 잔액 행 동시 생성 10건`);
    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        prisma.$transaction((tx) => lockPeriodBalance(tx, user!, nextPeriod.startIso, today)),
      ),
    );
    const failed = settled.filter((r) => r.status === "rejected");
    for (const f of failed) console.error("  실패:", (f as PromiseRejectedResult).reason);
    const balances = await prisma.leaveBalance.count({
      where: { userId: user.id, periodIndex: nextPeriod.index },
    });
    console.log(`✅ 성공: ${settled.length - failed.length}`);
    console.log(`📦 leave_balances(${nextPeriod.index}회차) 행 수: ${balances}`);
    ok = failed.length === 0 && balances === 1 && ok;
    // 이 스크립트가 만든 행이므로 되돌린다.
    await prisma.leaveBalance.deleteMany({ where: { userId: user.id, periodIndex: nextPeriod.index } });
  }

  console.log(ok ? "\n🎉 PASS" : "\n❌ FAIL");
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
