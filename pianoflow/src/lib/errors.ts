export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

const PRISMA_UNIQUE_VIOLATION = "P2002";

/** Prisma 고유 제약 위반(P2002)인지 판별. 부분 유니크 경쟁 시 skip 처리에 사용. */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === PRISMA_UNIQUE_VIOLATION
  );
}
