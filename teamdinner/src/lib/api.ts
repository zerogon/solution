import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 요청 본문을 zod로 검증한다. 실패하면 첫 번째 이슈 메시지로 400. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError(400, "요청 본문이 JSON이 아닙니다.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, res: jsonError(400, first?.message ?? "입력값이 올바르지 않습니다.") };
  }
  return { ok: true, data: parsed.data };
}
