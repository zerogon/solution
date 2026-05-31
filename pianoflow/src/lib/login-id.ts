import type { PrismaClient } from "@/generated/prisma/client";

export function getPhoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new Error("휴대폰 번호는 최소 4자리여야 합니다.");
  }
  return digits.slice(-4);
}

/** 로그인 ID = 휴대폰에서 010을 뺀 8자리 (예: 010-1234-5678 → 12345678) */
export function getPhoneLoginId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error("휴대폰 번호는 최소 8자리여야 합니다.");
  }
  return digits.slice(-8);
}

/**
 * 로그인 ID 발급. 휴대폰이 unique이고 ID는 끝 8자리로 결정적이므로
 * 별도 충돌 처리 없이 결정적으로 산출한다. (tx 인자는 호출부 호환용으로 유지)
 */
export async function generateLoginId(
  _tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  phone: string,
): Promise<string> {
  return getPhoneLoginId(phone);
}
