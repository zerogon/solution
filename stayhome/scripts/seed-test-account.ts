import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ResortSlug } from "../src/generated/prisma/client";
import { encrypt } from "../src/lib/crypto";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const lotte = await prisma.resort.findUnique({
    where: { slug: ResortSlug.LOTTE },
  });
  if (!lotte) throw new Error("LOTTE resort not seeded");

  const existing = await prisma.resortAccount.findFirst({
    where: { resortId: lotte.id, isPrimary: true },
  });
  if (existing) {
    console.log("Already exists:", existing.id);
    return;
  }

  const acc = await prisma.resortAccount.create({
    data: {
      resortId: lotte.id,
      label: "테스트 계정",
      idEncrypted: encrypt("test_user"),
      pwEncrypted: encrypt("test_password"),
      memo: "Phase B 검증용 더미",
      isPrimary: true,
    },
  });
  console.log("Created:", acc.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
