import type { LeaveBalance, PrismaClient } from "@/generated/prisma/client";
import { LeaveError } from "@/lib/errors";
import {
  autoDaysForPeriod,
  formatPeriodLabel,
  periodByIndex,
  periodFor,
  type LeavePeriod,
} from "@/lib/leave-accrual";
import { summarize, withGranted } from "@/lib/leave-balance";
import { formatDays } from "@/lib/labels";
import { parseDate, toIsoDate } from "@/lib/utils";

/**
 * 회차 잔액 행의 트랜잭션 스코프 조작 — 생성·잠금·재정렬.
 *
 * 잔액은 캘린더 연도가 아니라 **입사일 기준 회차** 단위다(`leave-accrual.ts`).
 * 회차 행은 미리 만들어 두지 않고 **필요할 때 지연 생성**한다. 그래서 새해가 와도,
 * 1년 넘은 직원을 뒤늦게 등록해도 "아직 부여되지 않았습니다"로 막히지 않는다.
 */

export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface LockedBalance {
  balance: LeaveBalance;
  period: LeavePeriod;
  autoDays: number;
}

export const NO_HIRE_DATE_MESSAGE =
  "입사일이 등록되지 않아 연차 회차를 계산할 수 없습니다. 관리자에게 문의하세요.";

/** 입사일을 ISO로. 없으면 도메인 오류 — 회차는 입사일 없이는 정의되지 않는다. */
export function requireHireIso(user: { hireDate: Date | null }): string {
  if (!user.hireDate) throw new LeaveError(NO_HIRE_DATE_MESSAGE);
  return toIsoDate(user.hireDate);
}

async function lockOrCreate(tx: TxClient, userId: string, period: LeavePeriod): Promise<string> {
  // Prisma의 upsert는 SELECT → INSERT/UPDATE로 컴파일돼 동시 생성에서 P2002가 난다.
  // `ON CONFLICT ... DO UPDATE`는 충돌 행에 **행 락을 잡고 RETURNING으로 돌려준다**
  // (DO NOTHING은 잡지도 돌려주지도 않는다). 한 문장으로 "없으면 만들고 있으면 잠근다"가
  // 원자적으로 끝나고, 락은 트랜잭션 끝까지 유지돼 기존 FOR UPDATE의 직렬화 성질을 대체한다.
  // 날짜는 **문자열로 넘겨 ::date로 캐스팅한다.** Date 객체를 넘기면 드라이버가 timestamptz로
  // 보내고 ::date 캐스팅이 세션 타임존을 타서 하루 밀릴 수 있다.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO leave_balances (id, user_id, period_index, period_start, period_end, total_days, created_at, updated_at)
    VALUES (gen_random_uuid()::text, ${userId}, ${period.index},
            ${period.startIso}::date, ${period.endIso}::date, NULL, NOW(), NOW())
    ON CONFLICT (user_id, period_index) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id`;
  return rows[0].id;
}

/**
 * `onIso`가 속한 회차의 잔액 행을 **생성하고 잠근다**.
 *
 * `todayIso`는 자동 발생량의 기준일이다 — 1년 미만 회차는 매달 커지므로 저장값이 아니라
 * 이 기준으로 계산한 값을 돌려준다(그래서 자동 회차는 갱신 UPDATE가 아예 없다).
 */
export async function lockPeriodBalance(
  tx: TxClient,
  user: { id: string; hireDate: Date | null },
  onIso: string,
  todayIso: string,
): Promise<LockedBalance> {
  const hireIso = requireHireIso(user);
  const period = periodFor(hireIso, onIso);
  const id = await lockOrCreate(tx, user.id, period);
  const balance = await tx.leaveBalance.findUniqueOrThrow({ where: { id } });
  return { balance, period, autoDays: autoDaysForPeriod(hireIso, period, todayIso) };
}

/**
 * 이미 아는 행을 id로 잠근다 — 취소 경로 전용.
 *
 * 시작일에서 회차를 **다시 유도하지 않는 것**이 핵심이다. 입사일이 수정된 뒤라면
 * 재유도한 회차가 신청 때 증가시킨 행과 달라져 usedDays가 영구히 어긋난다.
 */
export async function lockBalanceById(tx: TxClient, id: string): Promise<LeaveBalance> {
  await tx.$queryRaw`SELECT id FROM leave_balances WHERE id = ${id} FOR UPDATE`;
  return tx.leaveBalance.findUniqueOrThrow({ where: { id } });
}

/**
 * 입사일 변경 후 회차 경계를 다시 계산한다.
 *
 * `periodIndex`는 불변 신원이라 건드리지 않는다 — 그래서 유니크 키가 움직이지 않고,
 * `LeaveRequest.leaveBalanceId`가 가리키는 행도 그대로다(usedDays가 어긋나지 않는 이유).
 * 음수 index(전환 이전 캘린더 연도 행)는 회차가 정의되지 않으므로 놔둔다.
 */
export async function realignBalances(
  tx: TxClient,
  userId: string,
  newHireIso: string,
  todayIso: string,
): Promise<{ moved: number }> {
  const rows = await tx.leaveBalance.findMany({
    where: { userId, periodIndex: { gte: 1 } },
    orderBy: { periodIndex: "asc" },
  });

  for (const row of rows) {
    const period = periodByIndex(newHireIso, row.periodIndex);
    const autoDays = autoDaysForPeriod(newHireIso, period, todayIso);
    // 자동 회차는 부여가 줄어들 수 있다(예: 입사일을 뒤로 미루면 근속연수가 준다).
    // 이미 쓴 것보다 적어지면 잔여가 음수가 되므로 전체를 되돌린다.
    const after = summarize(withGranted(row, autoDays));
    if (after.remaining < 0) {
      throw new LeaveError(
        `입사일을 바꾸면 ${formatPeriodLabel(period)} 회차의 보유가 이미 사용한 ${formatDays(row.usedDays)}보다 적어집니다. 해당 연차를 먼저 취소하거나 수동 부여로 고정해주세요.`,
      );
    }
    await tx.leaveBalance.update({
      where: { id: row.id },
      data: { periodStart: parseDate(period.startIso), periodEnd: parseDate(period.endIso) },
    });
  }

  return { moved: rows.length };
}
