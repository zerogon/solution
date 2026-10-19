/** 도메인 규칙 위반(중복 날짜, 잘못된 기간 등). 메시지는 그대로 사용자에게 보인다. */
export class LeaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveError";
  }
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

const PRISMA_UNIQUE_VIOLATION = "P2002";

/** Prisma 고유 제약 위반(P2002)인지 판별. `leave_entry_days.date` 충돌 판정에 사용. */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === PRISMA_UNIQUE_VIOLATION
  );
}

/** 액션 catch 블록 공통 처리 — 도메인 오류/유니크 위반은 메시지로, 그 외는 로그 후 일반 메시지. */
export function toActionError(err: unknown, tag: string, fallback = "처리 중 오류가 발생했습니다."): { ok: false; message: string } {
  if (err instanceof LeaveError) return { ok: false, message: err.message };
  if (isPrismaUniqueViolation(err)) {
    return { ok: false, message: "이미 기록된 날짜가 포함되어 있습니다." };
  }
  console.error(`[${tag}]`, err);
  return { ok: false, message: fallback };
}
