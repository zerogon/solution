import type { PrismaClient } from "@/generated/prisma/client";
import {
  AuditAction,
  AuditTargetType,
  EmployeeStatus,
  LeaveStatus,
  type LeaveType,
} from "@/generated/prisma/enums";
import { LeaveError } from "@/lib/errors";
import { getHolidayOracle } from "@/lib/holidays-server";
import { LEAVE_DAYS_ERROR_MESSAGE, computeLeaveDays } from "@/lib/leave-days";
import { summarize } from "@/lib/leave-balance";
import { writeAudit } from "@/lib/audit";
import { formatDays } from "@/lib/labels";
import { parseDate, toIsoDate, todayKstIso } from "@/lib/utils";

/**
 * 연차 신청/취소의 상태 전이 — 전부 여기서, 전부 트랜잭션 안에서.
 *
 * 승인 절차는 없다(2026-09-05). 신청이 곧 확정(CONFIRMED)이고 같은 트랜잭션에서
 * `usedDays`를 더한다. 취소(본인/관리자)는 `usedDays`를 되돌린다.
 *
 * 액션(`src/actions/leave-requests.ts`)과 동시성 검증 스크립트(`scripts/race-test.ts`)가
 * **같은 함수**를 부른다. 그래서 `db`를 인자로 받는다.
 *
 * ## 동시성
 * 같은 직원의 동시 신청은 `leave_balances` 행 `FOR UPDATE`가 직렬화한다 — 두 번째
 * 트랜잭션은 첫 번째가 커밋될 때까지 기다렸다가 갱신된 usedDays를 본다.
 * 그 잠금을 우회하는 어떤 경로(예: 다른 연도 balance)든 `leave_request_days(user_id, date)`
 * 유니크가 최후 방어선으로 막는다(P2002 → 액션이 메시지로 번역).
 *
 * ## 자식 행(LeaveRequestDay)
 * CONFIRMED 동안만 존재한다. CANCELLED로 가면 같은 트랜잭션에서 지운다 —
 * 그래야 취소한 날짜에 다시 신청할 수 있다. 부모 행은 이력으로 남는다.
 */

type Actor = { id: string; name: string };

async function lockBalance(tx: TxClient, userId: string, year: number) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM leave_balances WHERE user_id = ${userId} AND year = ${year} FOR UPDATE`;
  if (rows.length === 0) {
    throw new LeaveError(`${year}년 연차가 아직 부여되지 않았습니다. 관리자에게 문의하세요.`);
  }
  const balance = await tx.leaveBalance.findUniqueOrThrow({ where: { userId_year: { userId, year } } });
  return balance;
}

async function lockRequest(tx: TxClient, requestId: string) {
  // 상태 전이 경쟁(본인 취소 vs 관리자 취소가 동시에)을 막기 위해 행을 잠근 뒤 읽는다.
  await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${requestId} FOR UPDATE`;
  const req = await tx.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { id: true, name: true, branchId: true } } },
  });
  if (!req) throw new LeaveError("신청을 찾을 수 없습니다.");
  return req;
}

/** 확정 건을 취소 상태로 옮기고 차감분을 되돌린다. 호출자가 권한·조건 검사를 끝낸 뒤 부른다. */
async function cancelConfirmed(
  tx: TxClient,
  req: Awaited<ReturnType<typeof lockRequest>>,
  by: { id: string; reason: string | null },
) {
  const balance = await lockBalance(tx, req.userId, req.startDate.getUTCFullYear());
  await tx.leaveBalance.update({
    where: { id: balance.id },
    data: { usedDays: { decrement: req.days } },
  });
  await tx.leaveRequestDay.deleteMany({ where: { leaveRequestId: req.id } });
  return tx.leaveRequest.update({
    where: { id: req.id },
    data: {
      status: LeaveStatus.CANCELLED,
      cancelledById: by.id,
      cancelledAt: new Date(),
      cancelReason: by.reason,
    },
  });
}

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// ───────────────────────── 신청(= 확정) ─────────────────────────

export async function createLeaveRequest(
  db: PrismaClient,
  input: { userId: string; type: LeaveType; startIso: string; endIso: string; reason: string },
) {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    include: { branch: { select: { closedWeekdays: true, status: true } } },
  });
  if (!user || user.status !== EmployeeStatus.ACTIVE) throw new LeaveError("재직 중인 직원만 신청할 수 있습니다.");
  if (!user.branch) throw new LeaveError("소속 지점이 없어 신청할 수 없습니다. 관리자에게 문의하세요.");

  const { oracle } = await getHolidayOracle();
  const calc = computeLeaveDays({
    type: input.type,
    startIso: input.startIso,
    endIso: input.endIso,
    closedWeekdays: user.branch.closedWeekdays,
    oracle,
  });
  if (!calc.ok) throw new LeaveError(LEAVE_DAYS_ERROR_MESSAGE[calc.reason]);

  const year = Number(input.startIso.slice(0, 4));

  return db.$transaction(async (tx) => {
    const balance = await lockBalance(tx, input.userId, year);
    const { remaining } = summarize(balance);
    if (calc.days > remaining) {
      throw new LeaveError(
        `잔여 연차가 부족합니다. (신청 ${formatDays(calc.days)} / 잔여 ${formatDays(Math.max(remaining, 0))})`,
      );
    }

    // 자식 유니크(user_id, date)가 같은 날짜 중복을 막는다. 여기서 findFirst로 미리 보는 것은
    // 친절한 메시지를 위해서이고, 정확성은 유니크 제약이 책임진다.
    const clash = await tx.leaveRequestDay.findFirst({
      where: { userId: input.userId, date: { in: calc.countedDates.map(parseDate) } },
      select: { date: true },
    });
    if (clash) {
      throw new LeaveError("이미 신청된 날짜가 포함되어 있습니다.");
    }

    const created = await tx.leaveRequest.create({
      data: {
        userId: input.userId,
        type: input.type,
        startDate: parseDate(input.startIso),
        endDate: parseDate(input.endIso),
        days: calc.days,
        reason: input.reason,
        dayRows: {
          create: calc.countedDates.map((iso) => ({
            userId: input.userId,
            date: parseDate(iso),
            type: input.type,
          })),
        },
      },
    });
    // 신청 = 확정. 같은 트랜잭션에서 차감해야 잔여와 신청이 어긋나지 않는다.
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { usedDays: { increment: calc.days } },
    });
    return created;
  });
}

// ───────────────────────── 직원 본인 취소 ─────────────────────────

/** 시작일이 오늘(KST) 이후인 확정 건만 본인이 취소할 수 있다. 지난 휴가는 관리자 몫. */
export async function cancelOwnRequest(db: PrismaClient, input: { requestId: string; userId: string }) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.userId !== input.userId) throw new LeaveError("본인의 신청만 취소할 수 있습니다.");
    if (req.status !== LeaveStatus.CONFIRMED) throw new LeaveError("이미 취소된 신청입니다.");
    if (toIsoDate(req.startDate) < todayKstIso()) {
      throw new LeaveError("이미 시작된 휴가는 직접 취소할 수 없습니다. 관리자에게 요청하세요.");
    }
    return cancelConfirmed(tx, req, { id: input.userId, reason: null });
  });
}

// ───────────────────────── 관리자 취소 ─────────────────────────

/** 확정된 연차의 관리자 취소. 날짜 제한 없음, 사유 선택, 감사 로그 기록. */
export async function adminCancelRequest(
  db: PrismaClient,
  input: { requestId: string; reason: string | null; actor: Actor },
) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.status !== LeaveStatus.CONFIRMED) throw new LeaveError("이미 취소된 신청입니다.");

    const updated = await cancelConfirmed(tx, req, { id: input.actor.id, reason: input.reason });
    await writeAudit(
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: AuditAction.CANCEL_REQUEST_ADMIN,
        targetType: AuditTargetType.LEAVE_REQUEST,
        targetId: req.id,
        description: `${req.user.name} ${formatDays(req.days)} 취소(연차 복원)${input.reason ? ` — ${input.reason}` : ""}`,
        metadata: { userId: req.userId, days: req.days, startDate: req.startDate, endDate: req.endDate },
      },
      tx,
    );
    return updated;
  });
}
