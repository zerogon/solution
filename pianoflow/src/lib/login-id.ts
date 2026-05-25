import type { PrismaClient } from "@/generated/prisma/client";

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export function getPhoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new Error("휴대폰 번호는 최소 4자리여야 합니다.");
  }
  return digits.slice(-4);
}

export async function generateLoginId(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  phone: string,
): Promise<string> {
  const last4 = getPhoneLast4(phone);

  const existing = await tx.user.findMany({
    where: { loginId: { startsWith: last4 } },
    select: { loginId: true },
  });

  const usedSuffixes = new Set(
    existing
      .map((u) => u.loginId.slice(last4.length))
      .filter((s) => s.length === 1),
  );

  for (const letter of SUFFIX_ALPHABET) {
    if (!usedSuffixes.has(letter)) {
      return `${last4}${letter}`;
    }
  }

  throw new Error(
    `휴대폰 뒷자리 ${last4}에 대한 로그인 ID를 더 이상 발급할 수 없습니다.`,
  );
}
