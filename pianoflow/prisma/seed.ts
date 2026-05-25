import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role, UserStatus, Weekday } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

function last4(phone: string) {
  return phone.replace(/\D/g, "").slice(-4);
}

async function nextLoginId(phone: string): Promise<string> {
  const prefix = last4(phone);
  const existing = await prisma.user.findMany({
    where: { loginId: { startsWith: prefix } },
    select: { loginId: true },
  });
  const usedIds = new Set(existing.map((u) => u.loginId));
  if (!usedIds.has(prefix)) return prefix;
  for (const letter of SUFFIX_ALPHABET) {
    const candidate = `${prefix}${letter}`;
    if (!usedIds.has(candidate)) return candidate;
  }
  throw new Error(`suffix exhausted for ${prefix}`);
}

async function createUser(input: {
  name: string;
  phone: string;
  role: Role;
  remainingLessons?: number;
  password?: string;
  mustChange?: boolean;
}) {
  const loginId = await nextLoginId(input.phone);
  const password = await bcrypt.hash(input.password ?? loginId, 10);
  return prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      loginId,
      password,
      mustChangePassword: input.mustChange ?? false,
      role: input.role,
      status: UserStatus.ACTIVE,
      remainingLessons: input.remainingLessons ?? 0,
    },
  });
}

async function main() {
  console.log("🧹 기존 데이터 삭제 중...");
  await prisma.lessonCreditLog.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.teacherAvailability.deleteMany();
  await prisma.user.deleteMany();

  console.log("👤 관리자 생성");
  await createUser({
    name: "관리자",
    phone: "010-0000-0000",
    role: Role.ADMIN,
    password: "admin1234",
    mustChange: false,
  });

  console.log("👩‍🏫 선생님 3명 생성 + 가용 요일 설정");
  const teacherSpec = [
    {
      name: "이소연",
      phone: "010-1111-1111",
      weekdays: [Weekday.MON, Weekday.WED, Weekday.SAT, Weekday.SUN],
    },
    {
      name: "한상아",
      phone: "010-2222-2222",
      weekdays: [Weekday.TUE, Weekday.FRI, Weekday.SUN],
    },
    {
      name: "이승준",
      phone: "010-3333-3333",
      weekdays: [Weekday.TUE, Weekday.WED, Weekday.THU],
    },
  ];

  for (const spec of teacherSpec) {
    const teacher = await createUser({
      name: spec.name,
      phone: spec.phone,
      role: Role.TEACHER,
      password: "teacher1234",
    });
    await prisma.teacherAvailability.createMany({
      data: spec.weekdays.map((weekday) => ({
        teacherId: teacher.id,
        weekday,
      })),
    });
  }

  console.log("🎹 학생 5명 생성 (뒷자리 5678 충돌 케이스 포함)");
  const students = [
    { name: "김민지", phone: "010-9999-5678" }, // 5678a
    { name: "박서연", phone: "010-8888-5678" }, // 5678b
    { name: "이지우", phone: "010-7777-1234" }, // 1234a
    { name: "정하늘", phone: "010-6666-4321" }, // 4321a
    { name: "최예준", phone: "010-5555-2468" }, // 2468a
  ];
  for (const s of students) {
    await createUser({
      name: s.name,
      phone: s.phone,
      role: Role.STUDENT,
      remainingLessons: 4,
      password: "student1234",
    });
  }

  console.log("\n✅ 시드 완료");
  console.log("   관리자: 0000 / admin1234");
  console.log("   선생님: 1111, 2222, 3333 / teacher1234");
  console.log("   학생:   5678, 5678a, 1234, 4321, 2468 / student1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
