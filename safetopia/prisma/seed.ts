/**
 * 로컬 개발 시드. `npm run db:local:seed` (assert-local-db 가드 뒤에서만 돈다).
 * 모든 표를 지우고 다시 만든다 — 운영에는 절대 쓰지 않는다.
 *
 *   비밀번호 1234
 *
 * 2025년은 "엑셀에서 옮겨 적은 해"를 흉내 낸다 — 공휴일 데이터가 없을 수 있어 일수를 직접 입력한 기록이다.
 * 2026년은 자동 계산 기록(어린이날을 낀 기간, 반차, 앞으로의 휴가)이다.
 */
import "../scripts/load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { LeaveType } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** dates = 실제로 쉰 날(= LeaveEntryDay 행). 날짜는 손으로 고른 평일이다. */
const ENTRIES: { type: LeaveType; start: string; end: string; dates: string[]; manual?: boolean; memo?: string }[] = [
  { type: LeaveType.FULL_DAY, start: "2025-05-07", end: "2025-05-09", dates: ["2025-05-07", "2025-05-08", "2025-05-09"], manual: true, memo: "가족 여행" },
  { type: LeaveType.AM_HALF, start: "2025-08-14", end: "2025-08-14", dates: ["2025-08-14"], manual: true, memo: "병원" },
  { type: LeaveType.FULL_DAY, start: "2025-12-26", end: "2025-12-26", dates: ["2025-12-26"], manual: true },
  { type: LeaveType.FULL_DAY, start: "2026-02-13", end: "2026-02-13", dates: ["2026-02-13"], memo: "설 연휴 앞" },
  // 5/5 어린이날이 끼어 3일 중 2일만 차감된다.
  { type: LeaveType.FULL_DAY, start: "2026-05-04", end: "2026-05-06", dates: ["2026-05-04", "2026-05-06"] },
  { type: LeaveType.FULL_DAY, start: "2026-07-20", end: "2026-07-24", dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"], memo: "여름휴가" },
  { type: LeaveType.PM_HALF, start: "2026-09-11", end: "2026-09-11", dates: ["2026-09-11"] },
  { type: LeaveType.FULL_DAY, start: "2026-11-13", end: "2026-11-13", dates: ["2026-11-13"], memo: "이사" },
  { type: LeaveType.FULL_DAY, start: "2026-12-24", end: "2026-12-24", dates: ["2026-12-24"] },
];

async function main() {
  console.log("🧹 기존 데이터 삭제 중...");
  await prisma.leaveEntryDay.deleteMany();
  await prisma.leaveEntry.deleteMany();
  await prisma.leaveYear.deleteMany();
  await prisma.owner.deleteMany();

  await prisma.owner.create({
    data: { name: "홍길동", password: await bcrypt.hash("1234", 10), closedWeekdays: [0, 6] },
  });

  await prisma.leaveYear.createMany({
    data: [
      { year: 2025, grantedDays: 15, carriedOverDays: 0 },
      { year: 2026, grantedDays: 15, carriedOverDays: 2, memo: "2025년 잔여 중 2일 이월" },
    ],
  });

  for (const e of ENTRIES) {
    const days = e.type === LeaveType.FULL_DAY ? e.dates.length : 0.5;
    await prisma.leaveEntry.create({
      data: {
        type: e.type,
        startDate: parseDate(e.start),
        endDate: parseDate(e.end),
        days,
        manualDays: e.manual ?? false,
        memo: e.memo ?? "",
        dayRows: { create: e.dates.map((iso) => ({ date: parseDate(iso), type: e.type })) },
      },
    });
  }

  console.log(`✅ 시드 완료 — 기록 ${ENTRIES.length}건. 비밀번호 1234`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
