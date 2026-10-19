import type { PrismaClient } from "@/generated/prisma/client";
import type { LeaveType } from "@/generated/prisma/enums";
import { LeaveError } from "@/lib/errors";
import { getHolidayOracle } from "@/lib/holidays-server";
import { LEAVE_DAYS_ERROR_MESSAGE, computeLeaveDays, manualEntryDates } from "@/lib/leave-days";
import { parseDate } from "@/lib/utils";

/**
 * 연차 기록 쓰기 — 추가·수정·삭제 전부 여기서, 전부 트랜잭션 안에서.
 *
 * 한 사람이 쓰는 장부라 잔여 잠금도, 상태 전이도 없다. 지킬 것은 둘뿐이다:
 * (1) 일수는 서버에서 다시 계산한다(클라이언트 미리보기를 믿지 않는다),
 * (2) 같은 날짜가 두 기록에 들어가지 않는다 — `leave_entry_days.date` 유니크가 최종 방어선이고
 *     여기 `findFirst`는 친절한 메시지용이다(P2002는 `toActionError`가 번역).
 *
 * 잔여가 모자라도 막지 않는다. 지난 해를 옮겨 적을 때 부여보다 먼저 기록을 넣는 일이 흔하다.
 */

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface EntryInput {
  type: LeaveType;
  startIso: string;
  endIso: string;
  /** null = 자동 계산. 숫자면 그 값을 그대로 쓴다(0.5 단위, 검증은 zod). */
  manualDays: number | null;
  memo: string;
}

async function resolveDays(db: PrismaClient, input: EntryInput) {
  const owner = await db.owner.findUnique({ where: { id: "owner" }, select: { closedWeekdays: true } });
  const closedWeekdays = owner?.closedWeekdays ?? [0, 6];
  const { oracle } = await getHolidayOracle();
  const args = { type: input.type, startIso: input.startIso, endIso: input.endIso, closedWeekdays, oracle };

  if (input.manualDays != null) {
    const r = manualEntryDates(args);
    if (!r.ok) throw new LeaveError(LEAVE_DAYS_ERROR_MESSAGE[r.reason]);
    return { days: input.manualDays, dates: r.dates, manual: true };
  }
  const r = computeLeaveDays(args);
  if (!r.ok) throw new LeaveError(LEAVE_DAYS_ERROR_MESSAGE[r.reason]);
  return { days: r.days, dates: r.countedDates, manual: false };
}

async function assertNoClash(tx: TxClient, dates: string[], exceptEntryId?: string) {
  const clash = await tx.leaveEntryDay.findFirst({
    where: {
      date: { in: dates.map(parseDate) },
      ...(exceptEntryId ? { entryId: { not: exceptEntryId } } : {}),
    },
    select: { date: true },
  });
  if (clash) throw new LeaveError("이미 기록된 날짜가 포함되어 있습니다.");
}

export async function createEntry(db: PrismaClient, input: EntryInput) {
  const calc = await resolveDays(db, input);
  return db.$transaction(async (tx) => {
    await assertNoClash(tx, calc.dates);
    return tx.leaveEntry.create({
      data: {
        type: input.type,
        startDate: parseDate(input.startIso),
        endDate: parseDate(input.endIso),
        days: calc.days,
        manualDays: calc.manual,
        memo: input.memo,
        dayRows: { create: calc.dates.map((iso) => ({ date: parseDate(iso), type: input.type })) },
      },
    });
  });
}

/** 수정 = 날짜 행을 지우고 다시 만든다. 자기 자신의 옛 날짜와는 충돌로 보지 않는다. */
export async function updateEntry(db: PrismaClient, id: string, input: EntryInput) {
  const calc = await resolveDays(db, input);
  return db.$transaction(async (tx) => {
    const existing = await tx.leaveEntry.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new LeaveError("기록을 찾을 수 없습니다.");
    await assertNoClash(tx, calc.dates, id);
    await tx.leaveEntryDay.deleteMany({ where: { entryId: id } });
    return tx.leaveEntry.update({
      where: { id },
      data: {
        type: input.type,
        startDate: parseDate(input.startIso),
        endDate: parseDate(input.endIso),
        days: calc.days,
        manualDays: calc.manual,
        memo: input.memo,
        dayRows: { create: calc.dates.map((iso) => ({ date: parseDate(iso), type: input.type })) },
      },
    });
  });
}

/** 하드 삭제. 날짜 행은 cascade로 함께 사라진다. */
export async function deleteEntry(db: PrismaClient, id: string) {
  const res = await db.leaveEntry.deleteMany({ where: { id } });
  if (res.count === 0) throw new LeaveError("이미 삭제된 기록입니다.");
}
