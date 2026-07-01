/**
 * 더미 학생 50명 생성 (추후 그대로 삭제 예정)
 *
 *   npx tsx scripts/seed-dummy-students.ts --dry-run   # 미리보기 (삽입 없음)
 *   npx tsx scripts/seed-dummy-students.ts             # 50명 생성
 *
 * 식별 규칙 (삭제 편의): 이름 "더미학생NN", 전화 010-0050-00NN,
 * 로그인ID = 전화 끝 8자리(00500001~00500050), 비밀번호 student1234.
 * 삭제는 scripts/delete-dummy-students.ts (phone startsWith "010-0050-").
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role, UserStatus } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PHONE_PREFIX = "010-0050-";
const COUNT = 50;
const PASSWORD = "student1234";

/** 로그인 ID = 휴대폰에서 010을 뺀 8자리 (seed.ts와 동일 규칙) */
function loginIdOf(phone: string) {
  return phone.replace(/\D/g, "").slice(-8);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // 재실행 안전성: 이미 존재하면 중복 삽입(unique 위반) 방지 위해 중단
  const existing = await prisma.user.count({
    where: { phone: { startsWith: PHONE_PREFIX } },
  });
  if (existing > 0) {
    console.error(
      `⚠️  이미 "${PHONE_PREFIX}*" 더미 학생이 ${existing}명 존재합니다. ` +
        `중복 삽입을 막기 위해 중단합니다. 먼저 delete-dummy-students.ts로 정리하세요.`,
    );
    process.exit(1);
  }

  const password = await bcrypt.hash(PASSWORD, 10);
  const data = Array.from({ length: COUNT }, (_, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const phone = `${PHONE_PREFIX}00${nn}`;
    return {
      name: `더미학생${nn}`,
      phone,
      loginId: loginIdOf(phone),
      password,
      mustChangePassword: false,
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      remainingLessons: 4,
      specialties: [],
    };
  });

  if (dryRun) {
    console.log(`🔎 [dry-run] 생성 예정 ${data.length}명:`);
    console.log(
      `   ${data[0].name} (${data[0].phone} / ${data[0].loginId}) ~ ` +
        `${data[data.length - 1].name} (${data[data.length - 1].phone} / ${data[data.length - 1].loginId})`,
    );
    console.log("   실제 삽입은 --dry-run 없이 실행하세요.");
    return;
  }

  const result = await prisma.user.createMany({ data });
  console.log(`✅ 더미 학생 ${result.count}명 생성 완료`);
  console.log(`   로그인 ID: 00500001 ~ 005000${COUNT} / 비밀번호: ${PASSWORD}`);
  console.log(`   삭제: npx tsx scripts/delete-dummy-students.ts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
