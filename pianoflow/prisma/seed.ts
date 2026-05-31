import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role, UserStatus, Weekday } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ALL_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

/** YYYY-MM-DD (KST) → 해당 일자 KST 자정의 UTC Date (slots.parseKstDate와 동일 규칙) */
function kstMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000);
}

function last4(phone: string) {
  return phone.replace(/\D/g, "").slice(-4);
}

/** 로그인 ID = 휴대폰에서 010을 뺀 8자리 */
function loginIdOf(phone: string) {
  return phone.replace(/\D/g, "").slice(-8);
}

async function createUser(input: {
  name: string;
  phone: string;
  role: Role;
  remainingLessons?: number;
  password?: string;
  mustChange?: boolean;
}) {
  const loginId = loginIdOf(input.phone);
  // 기본 비밀번호 = 휴대폰 끝 4자리 (명시 비밀번호가 있으면 우선)
  const password = await bcrypt.hash(input.password ?? last4(input.phone), 10);
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

  console.log("👩‍🏫 선생님 3명 생성 + 가용 요일/시간 설정");
  // weekdayHours: 요일별 예약 가능 시각. 데모를 위해 일부 요일은 부분 시간만 오픈.
  const teacherSpec: {
    name: string;
    phone: string;
    weekdayHours: { weekday: Weekday; hours: number[] }[];
  }[] = [
    {
      name: "이소연",
      phone: "010-1111-1111",
      weekdayHours: [
        { weekday: Weekday.MON, hours: ALL_HOURS },
        { weekday: Weekday.WED, hours: [14, 15, 16, 17, 18] }, // 오후만 오픈
        { weekday: Weekday.SAT, hours: ALL_HOURS },
        { weekday: Weekday.SUN, hours: ALL_HOURS },
      ],
    },
    {
      name: "한상아",
      phone: "010-2222-2222",
      weekdayHours: [
        { weekday: Weekday.TUE, hours: ALL_HOURS },
        { weekday: Weekday.FRI, hours: ALL_HOURS },
        { weekday: Weekday.SUN, hours: [10, 11, 12] }, // 오전만 오픈
      ],
    },
    {
      name: "이승준",
      phone: "010-3333-3333",
      weekdayHours: [
        { weekday: Weekday.TUE, hours: ALL_HOURS },
        { weekday: Weekday.WED, hours: ALL_HOURS },
        { weekday: Weekday.THU, hours: ALL_HOURS },
      ],
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
      data: spec.weekdayHours.map((wh) => ({
        teacherId: teacher.id,
        weekday: wh.weekday,
        hours: wh.hours,
      })),
    });
  }

  console.log("🎹 학생 5명 생성 (뒷자리 5678 충돌 케이스 포함)");
  // enrollment: 등록 기간 데모. 미설정 학생은 무제한.
  const students: {
    name: string;
    phone: string;
    enrollment?: { start: string; end: string };
  }[] = [
    {
      name: "김민지",
      phone: "010-9999-5678",
      enrollment: { start: "2026-05-01", end: "2026-06-30" },
    }, // 기간 내
    {
      name: "박서연",
      phone: "010-8888-5678",
      enrollment: { start: "2026-01-01", end: "2026-03-31" },
    }, // 기간 만료 (예약 차단 데모)
    { name: "이지우", phone: "010-7777-1234" }, // 무제한
    { name: "정하늘", phone: "010-6666-4321" }, // 무제한
    { name: "최예준", phone: "010-5555-2468" }, // 무제한
  ];
  for (const s of students) {
    const student = await createUser({
      name: s.name,
      phone: s.phone,
      role: Role.STUDENT,
      remainingLessons: 4,
      password: "student1234",
    });
    if (s.enrollment) {
      await prisma.user.update({
        where: { id: student.id },
        data: {
          enrollmentStart: kstMidnight(s.enrollment.start),
          enrollmentEnd: kstMidnight(s.enrollment.end),
        },
      });
    }
  }

  console.log("\n✅ 시드 완료 (로그인 ID = 휴대폰 8자리, 비밀번호는 아래 명시값)");
  console.log("   관리자: 00000000 / admin1234");
  console.log("   선생님: 11111111, 22222222, 33333333 / teacher1234");
  console.log("   학생:   99995678, 88885678, 77771234, 66664321, 55552468 / student1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
