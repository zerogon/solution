/**
 * 일회성 마이그레이션:
 * 기존 회원의 loginId를 새 규칙(숫자4자리 base → a,b,c… 접미사)으로 재정렬하고
 * 비밀번호를 새 loginId와 동일하게 재설정.
 *
 * 사용:
 *   npx tsx scripts/migrate-login-ids.ts --dry-run   # 미리보기
 *   npx tsx scripts/migrate-login-ids.ts             # 실행
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function last4(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, loginId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof users>();
  for (const u of users) {
    const key = last4(u.phone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }

  let migrated = 0;
  let skipped = 0;

  for (const [key, members] of groups) {
    const expected = members.map((_, i) =>
      i === 0 ? key : `${key}${SUFFIX_ALPHABET[i - 1]}`,
    );

    if (members.length > 1 + SUFFIX_ALPHABET.length) {
      console.error(
        `[SKIP] 그룹 ${key}: ${members.length}명 (한계 27명 초과). 수동 처리 필요.`,
      );
      skipped += members.length;
      continue;
    }

    const changes = members
      .map((u, i) => ({ user: u, newId: expected[i] }))
      .filter((c) => c.user.loginId !== c.newId);

    if (changes.length === 0) continue;

    console.log(`\n[그룹 ${key}] ${changes.length}건 변경`);
    for (const c of changes) {
      console.log(`  ${c.user.loginId.padEnd(8)} → ${c.newId.padEnd(8)}  (${c.user.name})`);
    }
    if (dryRun) {
      migrated += changes.length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        await tx.user.update({
          where: { id: c.user.id },
          data: { loginId: `__migr_${c.user.id}` },
        });
      }
      for (const c of changes) {
        const hash = await bcrypt.hash(c.newId, 10);
        await tx.user.update({
          where: { id: c.user.id },
          data: {
            loginId: c.newId,
            password: hash,
            mustChangePassword: false,
          },
        });
      }
    });
    migrated += changes.length;
  }

  console.log(
    `\n${dryRun ? "[dry-run] " : ""}총 ${migrated}건 변경 예정${
      dryRun ? "" : " 완료"
    }${skipped > 0 ? `, ${skipped}건 스킵(수동 필요)` : ""}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
