/**
 * 일회성 마이그레이션:
 * 기존 회원의 loginId를 새 규칙(휴대폰에서 010을 뺀 8자리)으로 재설정하고,
 * 비밀번호를 휴대폰 끝 4자리로 재설정한다.
 *   예) 010-1234-5678 → loginId "12345678", password "5678"
 * mustChangePassword는 현행 값을 유지한다(변경하지 않음).
 *
 * 사용:
 *   npx tsx scripts/migrate-login-ids.ts --dry-run   # 미리보기
 *   npx tsx scripts/migrate-login-ids.ts             # 실행
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}
function newLoginId(phone: string): string {
  return digits(phone).slice(-8);
}
function newPassword(phone: string): string {
  return digits(phone).slice(-4);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, loginId: true },
    orderBy: { createdAt: "asc" },
  });

  // 새 loginId 충돌 검사 (서로 다른 번호가 동일 8자리 → 수동 처리 필요)
  const byNewId = new Map<string, typeof users>();
  for (const u of users) {
    const id = newLoginId(u.phone);
    if (!byNewId.has(id)) byNewId.set(id, []);
    byNewId.get(id)!.push(u);
  }

  const targets: typeof users = [];
  let skipped = 0;
  for (const [id, group] of byNewId) {
    if (group.length > 1) {
      console.error(
        `[SKIP] 새 ID ${id} 충돌: ${group
          .map((g) => `${g.name}(${g.phone})`)
          .join(", ")} — 수동 처리 필요.`,
      );
      skipped += group.length;
      continue;
    }
    targets.push(group[0]);
  }

  const changes = targets
    .map((u) => ({ user: u, newId: newLoginId(u.phone), newPw: newPassword(u.phone) }))
    // loginId가 이미 동일하더라도 비밀번호는 항상 재설정 대상
    .filter(Boolean);

  console.log(`\n총 ${changes.length}명 처리 예정${skipped ? `, ${skipped}명 스킵` : ""}`);
  for (const c of changes) {
    const idMark = c.user.loginId === c.newId ? "(ID 유지)" : `${c.user.loginId} →`;
    console.log(
      `  ${c.user.name.padEnd(6)} ${idMark} ${c.newId}  pw=${c.newPw}`,
    );
  }

  if (dryRun) {
    console.log("\n[dry-run] 실제 변경 없음.");
    await prisma.$disconnect();
    return;
  }

  // 해시는 느리므로 트랜잭션 밖에서 미리 계산 (트랜잭션 타임아웃 방지)
  const hashed = await Promise.all(
    changes.map(async (c) => ({ ...c, hash: await bcrypt.hash(c.newPw, 10) })),
  );

  await prisma.$transaction(
    async (tx) => {
      // 1단계: 유니크 충돌 회피용 임시 loginId
      for (const c of hashed) {
        await tx.user.update({
          where: { id: c.user.id },
          data: { loginId: `__migr_${c.user.id}` },
        });
      }
      // 2단계: 최종 loginId + 비밀번호(끝4자리)
      for (const c of hashed) {
        await tx.user.update({
          where: { id: c.user.id },
          data: { loginId: c.newId, password: c.hash },
        });
      }
    },
    { timeout: 30000 },
  );

  console.log(`\n✅ ${changes.length}명 마이그레이션 완료.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
