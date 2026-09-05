/**
 * 로컬 개발 시드. `npm run db:local:seed` (assert-local-db 가드 뒤에서만 돈다).
 *
 * 계정
 *   관리자  admin  / admin1234
 *   직원    emp01~emp08 / 1234   (emp01·emp02는 비밀번호 변경 완료 상태, 나머지는 첫 로그인 시 변경 강제)
 */
import "../scripts/load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  Role,
} from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function main() {
  console.log("🧹 기존 데이터 삭제 중...");
  await prisma.leaveRequestDay.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveAdjustment.deleteMany();
  await prisma.branchHistory.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  console.log("🏪 지점 생성...");
  const [gangnam, hongdae, pangyo] = await Promise.all([
    prisma.branch.create({
      data: { name: "강남점", address: "서울 강남구 테헤란로 1", phone: "02-111-1111", closedWeekdays: [] },
    }),
    prisma.branch.create({
      data: { name: "홍대점", address: "서울 마포구 양화로 2", phone: "02-222-2222", closedWeekdays: [1] },
    }),
    prisma.branch.create({
      data: { name: "판교점", address: "경기 성남시 분당구 판교역로 3", phone: "031-333-3333", closedWeekdays: [2], minStaff: 2 },
    }),
  ]);

  console.log("👤 사용자 생성...");
  const adminHash = await bcrypt.hash("admin1234", 10);
  const empHash = await bcrypt.hash("1234", 10);

  const admin = await prisma.user.create({
    data: {
      loginId: "admin",
      password: adminHash,
      mustChangePassword: false,
      name: "김관리",
      email: "admin@safetopia.local",
      role: Role.ADMIN,
      status: EmployeeStatus.ACTIVE,
    },
  });

  const year = new Date().getUTCFullYear();
  const employeesSpec = [
    { loginId: "emp01", name: "이하나", branch: gangnam, hireDate: `${year - 3}-03-02`, total: 15, carried: 2, mustChange: false },
    { loginId: "emp02", name: "박두리", branch: gangnam, hireDate: `${year - 1}-07-15`, total: 15, carried: 0, mustChange: false },
    { loginId: "emp03", name: "최세영", branch: gangnam, hireDate: `${year}-02-01`, total: 11, carried: 0, mustChange: true },
    { loginId: "emp04", name: "정네모", branch: hongdae, hireDate: `${year - 2}-05-20`, total: 15, carried: 3, mustChange: true },
    { loginId: "emp05", name: "강다섯", branch: hongdae, hireDate: `${year - 1}-11-01`, total: 15, carried: 1, mustChange: true },
    { loginId: "emp06", name: "윤여섯", branch: hongdae, hireDate: `${year}-04-10`, total: 11, carried: 0, mustChange: true },
    { loginId: "emp07", name: "장일곱", branch: pangyo, hireDate: `${year - 4}-01-08`, total: 16, carried: 0, mustChange: true },
    { loginId: "emp08", name: "오여덟", branch: pangyo, hireDate: `${year - 1}-09-01`, total: 15, carried: 0, mustChange: true },
  ];

  const employees: Awaited<ReturnType<typeof prisma.user.create>>[] = [];
  for (const spec of employeesSpec) {
    const u = await prisma.user.create({
      data: {
        loginId: spec.loginId,
        password: empHash,
        mustChangePassword: spec.mustChange,
        name: spec.name,
        phone: `010-0000-${spec.loginId.slice(-2).padStart(4, "0")}`,
        role: Role.EMPLOYEE,
        status: EmployeeStatus.ACTIVE,
        branchId: spec.branch.id,
        hireDate: parseDate(spec.hireDate),
        leaveBalances: {
          create: { year, totalDays: spec.total, carriedOverDays: spec.carried },
        },
        branchHistories: {
          create: { toBranchId: spec.branch.id, changedById: admin.id, reason: "최초 배정" },
        },
      },
    });
    employees.push(u);
  }
  // 퇴사자 1명 — 로그인 차단 검증용.
  await prisma.user.create({
    data: {
      loginId: "retired01",
      password: empHash,
      mustChangePassword: false,
      name: "한퇴사",
      role: Role.EMPLOYEE,
      status: EmployeeStatus.RETIRED,
      branchId: gangnam.id,
      hireDate: parseDate(`${year - 2}-01-01`),
    },
  });

  console.log("📝 샘플 신청 생성...");
  const today = todayIso();
  const [e1, e2, , e4, e5, , e7] = employees;

  async function request(
    user: (typeof employees)[number],
    type: LeaveType,
    startIso: string,
    endIso: string,
    reason: string,
    status: LeaveStatus,
    opts: { cancelReason?: string } = {},
  ) {
    const dates: string[] = [];
    if (type === LeaveType.FULL_DAY) {
      for (let c = startIso; c <= endIso; c = addDays(c, 1)) dates.push(c);
    } else {
      dates.push(startIso);
    }
    const days = type === LeaveType.FULL_DAY ? dates.length : 0.5;
    // 확정 건만 날짜 행을 갖고 잔액을 차감한다. 취소 건은 이력만 남는다(leave-service.ts 규칙과 동일).
    const confirmed = status === LeaveStatus.CONFIRMED;
    const req = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        type,
        startDate: parseDate(startIso),
        endDate: parseDate(endIso),
        days,
        reason,
        status,
        cancelReason: opts.cancelReason ?? null,
        cancelledById: confirmed ? null : admin.id,
        cancelledAt: confirmed ? null : new Date(),
        dayRows: confirmed
          ? { create: dates.map((iso) => ({ userId: user.id, date: parseDate(iso), type })) }
          : undefined,
      },
    });
    if (confirmed) {
      await prisma.leaveBalance.update({
        where: { userId_year: { userId: user.id, year } },
        data: { usedDays: { increment: days } },
      });
    }
    return req;
  }

  // 확정 — 과거 2건(본인 취소 불가, 관리자만)
  await request(e1, LeaveType.FULL_DAY, addDays(today, -20), addDays(today, -19), "가족 여행", LeaveStatus.CONFIRMED);
  await request(e4, LeaveType.PM_HALF, addDays(today, -7), addDays(today, -7), "병원 진료", LeaveStatus.CONFIRMED);
  // 확정 — 오늘 휴가자 1건
  await request(e7, LeaveType.FULL_DAY, today, today, "개인 사정", LeaveStatus.CONFIRMED);
  // 확정 — 미래 3건(직원 화면에서 "신청 취소" 버튼 확인용)
  await request(e2, LeaveType.FULL_DAY, addDays(today, 5), addDays(today, 6), "이사", LeaveStatus.CONFIRMED);
  await request(e5, LeaveType.AM_HALF, addDays(today, 3), addDays(today, 3), "관공서 방문", LeaveStatus.CONFIRMED);
  await request(e1, LeaveType.FULL_DAY, addDays(today, 12), addDays(today, 12), "결혼식 참석", LeaveStatus.CONFIRMED);
  // 관리자 취소 1건
  await request(e2, LeaveType.FULL_DAY, addDays(today, -3), addDays(today, -3), "휴식", LeaveStatus.CANCELLED, {
    cancelReason: "직원 요청으로 취소",
  });

  console.log("\n✅ 시드 완료");
  console.table([
    { 역할: "관리자", 아이디: "admin", 비밀번호: "admin1234", 비고: "" },
    { 역할: "직원", 아이디: "emp01", 비밀번호: "1234", 비고: "강남점, 변경 완료" },
    { 역할: "직원", 아이디: "emp02", 비밀번호: "1234", 비고: "강남점, 변경 완료" },
    { 역할: "직원", 아이디: "emp03~emp08", 비밀번호: "1234", 비고: "첫 로그인 시 비밀번호 변경 강제" },
    { 역할: "퇴사", 아이디: "retired01", 비밀번호: "1234", 비고: "로그인 차단" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
