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
import { parseDate } from "@/lib/utils";

/**
 * 연차 신청/승인/반려/취소의 상태 전이 — 전부 여기서, 전부 트랜잭션 안에서.
 *
 * 액션(`src/actions/leave-requests.ts`)과 동시성 검증 스크립트(`scripts/race-test.ts`)가
 * **같은 함수**를 부른다. 그래서 `db`를 인자로 받는다.
 *
 * ## 동시성
 * 같은 직원의 동시 신청은 `leave_balances` 행 `FOR UPDATE`가 직렬화한다 — 두 번째
 * 트랜잭션은 첫 번째가 커밋될 때까지 기다렸다가 갱신된 pending 합을 본다.
 * 그 잠금을 우회하는 어떤 경로(예: 다른 연도 balance)든 `leave_request_days(user_id, date)`
 * 유니크가 최후 방어선으로 막는다(P2002 → 액션이 메시지로 번역).
 *
 * ## 자식 행(LeaveRequestDay)
 * PENDING/APPROVED 동안만 존재한다. REJECTED/CANCELLED로 가면 같은 트랜잭션에서 지운다 —
 * 그래야 반려된 날짜에 다시 신청할 수 있다. 부모 행은 이력으로 남는다.
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

async function pendingSum(tx: TxClient, userId: string, year: number) {
  const agg = await tx.leaveRequest.aggregate({
    _sum: { days: true },
    where: {
      userId,
      status: LeaveStatus.PENDING,
      startDate: { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) },
    },
  });
  return agg._sum.days ?? 0;
}

async function lockRequest(tx: TxClient, requestId: string) {
  // 상태 전이 경쟁(승인 vs 취소가 동시에)을 막기 위해 행을 잠근 뒤 읽는다.
  await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${requestId} FOR UPDATE`;
  const req = await tx.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { id: true, name: true, branchId: true } } },
  });
  if (!req) throw new LeaveError("신청을 찾을 수 없습니다.");
  return req;
}

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// ───────────────────────── 신청 ─────────────────────────

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
    const pending = await pendingSum(tx, input.userId, year);
    const { available } = summarize(balance, pending);
    if (calc.days > available) {
      throw new LeaveError(
        `신청 가능 연차가 부족합니다. (신청 ${formatDays(calc.days)} / 가능 ${formatDays(Math.max(available, 0))})`,
      );
    }

    // 자식 유니크(user_id, date)가 같은 날짜 중복을 막는다. 여기서 findFirst로 미리 보는 것은
    // 친절한 메시지를 위해서이고, 정확성은 유니크 제약이 책임진다.
    const clash = await tx.leaveRequestDay.findFirst({
      where: { userId: input.userId, date: { in: calc.countedDates.map(parseDate) } },
      select: { date: true },
    });
    if (clash) {
      throw new LeaveError("이미 신청(대기/승인)된 날짜가 포함되어 있습니다.");
    }

    return tx.leaveRequest.create({
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
  });
}

// ───────────────────────── 직원 본인 취소 ─────────────────────────

export async function cancelOwnPendingRequest(db: PrismaClient, input: { requestId: string; userId: string }) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.userId !== input.userId) throw new LeaveError("본인의 신청만 취소할 수 있습니다.");
    if (req.status !== LeaveStatus.PENDING) {
      throw new LeaveError("승인 대기 중인 신청만 취소할 수 있습니다. 승인된 연차는 관리자에게 요청하세요.");
    }
    await tx.leaveRequestDay.deleteMany({ where: { leaveRequestId: req.id } });
    return tx.leaveRequest.update({
      where: { id: req.id },
      data: { status: LeaveStatus.CANCELLED, cancelledById: input.userId, cancelledAt: new Date() },
    });
  });
}

// ───────────────────────── 관리자 승인/반려/취소 ─────────────────────────

export async function approveLeaveRequest(db: PrismaClient, input: { requestId: string; actor: Actor }) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.status !== LeaveStatus.PENDING) throw new LeaveError("이미 처리된 신청입니다.");

    const year = req.startDate.getUTCFullYear();
    const balance = await lockBalance(tx, req.userId, year);
    // 승인 시점의 실제 잔여(대기분 제외)만 본다 — 대기 중인 다른 신청은 아직 차감 전이다.
    const { remaining } = summarize(balance, 0);
    if (req.days > remaining) {
      throw new LeaveError(
        `잔여 연차가 부족해 승인할 수 없습니다. (신청 ${formatDays(req.days)} / 잔여 ${formatDays(remaining)})`,
      );
    }

    const updated = await tx.leaveRequest.update({
      where: { id: req.id },
      data: { status: LeaveStatus.APPROVED, approvedById: input.actor.id, approvedAt: new Date() },
    });
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { usedDays: { increment: req.days } },
    });
    await writeAudit(
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: AuditAction.APPROVE_REQUEST,
        targetType: AuditTargetType.LEAVE_REQUEST,
        targetId: req.id,
        description: `${req.user.name} ${formatDays(req.days)} 승인`,
        metadata: { userId: req.userId, days: req.days, startDate: req.startDate, endDate: req.endDate },
      },
      tx,
    );
    return updated;
  });
}

export async function rejectLeaveRequest(
  db: PrismaClient,
  input: { requestId: string; reason: string; actor: Actor },
) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.status !== LeaveStatus.PENDING) throw new LeaveError("이미 처리된 신청입니다.");

    await tx.leaveRequestDay.deleteMany({ where: { leaveRequestId: req.id } });
    const updated = await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: LeaveStatus.REJECTED,
        rejectionReason: input.reason,
        approvedById: input.actor.id,
        approvedAt: new Date(),
      },
    });
    await writeAudit(
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: AuditAction.REJECT_REQUEST,
        targetType: AuditTargetType.LEAVE_REQUEST,
        targetId: req.id,
        description: `${req.user.name} ${formatDays(req.days)} 반려 — ${input.reason}`,
        metadata: { userId: req.userId, reason: input.reason },
      },
      tx,
    );
    return updated;
  });
}

/** 승인된 연차의 관리자 취소. usedDays를 되돌리고 자식 행을 지워 그 날짜를 다시 열어 준다. */
export async function adminCancelRequest(
  db: PrismaClient,
  input: { requestId: string; reason: string | null; actor: Actor },
) {
  return db.$transaction(async (tx) => {
    const req = await lockRequest(tx, input.requestId);
    if (req.status !== LeaveStatus.APPROVED && req.status !== LeaveStatus.PENDING) {
      throw new LeaveError("이미 종료된 신청입니다.");
    }

    if (req.status === LeaveStatus.APPROVED) {
      const balance = await lockBalance(tx, req.userId, req.startDate.getUTCFullYear());
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: { decrement: req.days } },
      });
    }
    await tx.leaveRequestDay.deleteMany({ where: { leaveRequestId: req.id } });
    const updated = await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: LeaveStatus.CANCELLED,
        cancelledById: input.actor.id,
        cancelledAt: new Date(),
        rejectionReason: input.reason,
      },
    });
    await writeAudit(
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: AuditAction.CANCEL_REQUEST_ADMIN,
        targetType: AuditTargetType.LEAVE_REQUEST,
        targetId: req.id,
        description: `${req.user.name} ${formatDays(req.days)} 취소(${req.status === LeaveStatus.APPROVED ? "승인분 복원" : "대기분"})${input.reason ? ` — ${input.reason}` : ""}`,
        metadata: { userId: req.userId, days: req.days, previousStatus: req.status },
      },
      tx,
    );
    return updated;
  });
}
