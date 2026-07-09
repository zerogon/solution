/**
 * 더미 학생 50명의 6~8월(2026) 랜덤 레슨 예약 생성 (추후 그대로 삭제 예정)
 *
 *   npx tsx scripts/seed-dummy-reservations.ts --dry-run   # 미리보기 (삽입 없음)
 *   npx tsx scripts/seed-dummy-reservations.ts             # 예약 생성
 *
 * 대상 학생: 전화가 "010-0050-"로 시작하는 STUDENT (seed-dummy-students.ts로 생성).
 * 규칙: 슬롯 정시·KST 10~22시, 교사 가용 요일/시간에만, (교사,슬롯) ACTIVE 유니크.
 * 예약마다 LessonCreditLog 기록(RESERVE/-1, 취소 시 CANCEL/+1)으로 크레딧 정합성 유지.
 * 삭제는 scripts/delete-dummy-reservations.ts.
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role, ReservationStatus, CreditChangeReason, Weekday } from "../src/generated/prisma/enums.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PHONE_PREFIX = "010-0050-";
const RANGE_START = "2026-06-01";
const RANGE_END = "2026-08-31"; // 포함
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CANCEL_RATIO = 0.1; // 전체의 ~10% 취소
const FEEDBACK_RATIO = 0.7; // 과거 ACTIVE 중 ~70% 피드백

const WEEKDAY_MAP: Record<number, Weekday> = {
  0: Weekday.SUN, 1: Weekday.MON, 2: Weekday.TUE, 3: Weekday.WED,
  4: Weekday.THU, 5: Weekday.FRI, 6: Weekday.SAT,
};

const FEEDBACK_SAMPLES = [
  "박자를 잘 맞췄어요. 다음엔 셈여림에 더 신경 써봅시다.",
  "스케일 연습이 많이 늘었습니다. 손목 긴장을 조금만 풀어주세요.",
  "곡 해석이 좋아졌어요. 페달 사용을 다듬어봅시다.",
  "지난주보다 훨씬 안정적입니다. 이 페이스 유지해요.",
  "왼손 반주가 자연스러워졌어요. 오른손 멜로디를 더 노래하듯이.",
  "리듬감이 좋습니다. 어려운 구간은 천천히 반복 연습 권장해요.",
];

/** YYYY-MM-DD (KST) → 해당 일자 KST 자정의 UTC ms (slots.parseKstDate와 동일) */
function kstMidnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
}
function fmtKstDate(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function weekdayOfMs(ms: number): Weekday {
  return WEEKDAY_MAP[new Date(ms + KST_OFFSET_MS).getUTCDay()];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type PoolSlot = { teacherId: string; slotMs: number; iso: string; isPast: boolean };

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = Date.now();

  // 1. 더미 학생 로드
  const students = await prisma.user.findMany({
    where: { phone: { startsWith: PHONE_PREFIX }, role: Role.STUDENT },
    select: { id: true, name: true },
    orderBy: { phone: "asc" },
  });
  if (students.length === 0) {
    console.error(`⚠️  "${PHONE_PREFIX}*" 더미 학생이 없습니다. 먼저 seed-dummy-students.ts를 실행하세요.`);
    process.exit(1);
  }

  // 2. 재실행 가드: 이미 예약이 있으면 중단
  const studentIds = students.map((s) => s.id);
  const existing = await prisma.reservation.count({ where: { studentId: { in: studentIds } } });
  if (existing > 0) {
    console.error(
      `⚠️  더미 학생에게 이미 예약 ${existing}건이 있습니다. 중복 생성을 막기 위해 중단합니다. ` +
        `먼저 delete-dummy-reservations.ts로 정리하세요.`,
    );
    process.exit(1);
  }

  // 3. 교사 + 가용성 로드
  const teachers = await prisma.user.findMany({
    where: { role: Role.TEACHER },
    select: { id: true, name: true, availability: { select: { weekday: true, hours: true } } },
  });
  if (teachers.length === 0) {
    console.error("⚠️  선생님(TEACHER)이 없습니다. 먼저 prisma/seed.ts를 실행하세요.");
    process.exit(1);
  }

  // 4. 유효 슬롯 풀 구성 (RANGE_START ~ RANGE_END, 교사 가용 요일/시간)
  const pool: PoolSlot[] = [];
  const startMs = kstMidnightMs(RANGE_START);
  const endMs = kstMidnightMs(RANGE_END);
  for (let dayMs = startMs; dayMs <= endMs; dayMs += DAY_MS) {
    const weekday = weekdayOfMs(dayMs);
    for (const t of teachers) {
      const avail = t.availability.find((a) => a.weekday === weekday);
      if (!avail) continue;
      for (const hour of avail.hours) {
        const slotMs = dayMs + hour * 60 * 60 * 1000;
        pool.push({
          teacherId: t.id,
          slotMs,
          iso: new Date(slotMs).toISOString(),
          isPast: slotMs < now,
        });
      }
    }
  }
  if (pool.length === 0) {
    console.error("⚠️  유효한 슬롯이 없습니다(교사 가용성 확인). 중단합니다.");
    process.exit(1);
  }

  // 5~6. 학생별 랜덤 예약 생성 (ACTIVE (교사,슬롯) 전역 유니크)
  const used = new Set<string>();
  const reservationRows: any[] = [];
  const creditRows: any[] = [];
  const balanceByStudent = new Map<string, number>();
  let activeCount = 0;
  let cancelledCount = 0;
  let feedbackCount = 0;

  for (const student of students) {
    const target = randInt(4, 8);
    let made = 0;
    let attempts = 0;
    while (made < target && attempts < target * 40) {
      attempts++;
      const cand = pick(pool);
      const key = `${cand.teacherId}|${cand.iso}`;
      if (used.has(key)) continue;
      used.add(key);
      made++;

      const reservationId = randomUUID();
      const createdAt = new Date(cand.slotMs - randInt(1, 14) * DAY_MS);
      const isCancelled = Math.random() < CANCEL_RATIO;

      if (isCancelled) {
        cancelledCount++;
        // 취소 시각: 생성~슬롯 사이
        const cancelledAt = new Date(createdAt.getTime() + Math.floor((cand.slotMs - createdAt.getTime()) * Math.random()));
        reservationRows.push({
          id: reservationId,
          teacherId: cand.teacherId,
          studentId: student.id,
          slotDatetime: new Date(cand.slotMs),
          status: ReservationStatus.CANCELLED,
          cancelledAt,
          cancelledBy: student.id,
          createdAt,
        });
        // RESERVE(-1) + CANCEL(+1) → 순변화 0
        creditRows.push({
          id: randomUUID(), studentId: student.id, delta: -1,
          reason: CreditChangeReason.RESERVE, actorId: student.id, reservationId, createdAt,
        });
        creditRows.push({
          id: randomUUID(), studentId: student.id, delta: 1,
          reason: CreditChangeReason.CANCEL, actorId: student.id, reservationId, createdAt: cancelledAt,
        });
      } else {
        activeCount++;
        const giveFeedback = cand.isPast && Math.random() < FEEDBACK_RATIO;
        if (giveFeedback) feedbackCount++;
        reservationRows.push({
          id: reservationId,
          teacherId: cand.teacherId,
          studentId: student.id,
          slotDatetime: new Date(cand.slotMs),
          status: ReservationStatus.ACTIVE,
          feedback: giveFeedback ? pick(FEEDBACK_SAMPLES) : null,
          feedbackAt: giveFeedback ? new Date(cand.slotMs + randInt(1, 3) * 60 * 60 * 1000) : null,
          createdAt,
        });
        creditRows.push({
          id: randomUUID(), studentId: student.id, delta: -1,
          reason: CreditChangeReason.RESERVE, actorId: student.id, reservationId, createdAt,
        });
      }
    }
    // 학생 잔여 크레딧: 랜덤 0~5 (로그 합과 모순 없음)
    balanceByStudent.set(student.id, randInt(0, 5));
  }

  if (dryRun) {
    console.log(`🔎 [dry-run] 예약 생성 예정 (학생 ${students.length}명, 슬롯 풀 ${pool.length}개)`);
    console.log(`   총 예약 ${reservationRows.length}건 = ACTIVE ${activeCount} + CANCELLED ${cancelledCount}`);
    console.log(`   과거 수업 피드백 ${feedbackCount}건, 크레딧로그 ${creditRows.length}건`);
    console.log("   실제 삽입은 --dry-run 없이 실행하세요.");
    return;
  }

  const r = await prisma.reservation.createMany({ data: reservationRows });
  const c = await prisma.lessonCreditLog.createMany({ data: creditRows });
  for (const [studentId, balance] of balanceByStudent) {
    await prisma.user.update({ where: { id: studentId }, data: { remainingLessons: balance } });
  }

  console.log(`✅ 더미 예약 생성 완료`);
  console.log(`   예약 ${r.count}건 (ACTIVE ${activeCount} / CANCELLED ${cancelledCount})`);
  console.log(`   피드백 ${feedbackCount}건, 크레딧로그 ${c.count}건, 학생 ${balanceByStudent.size}명 잔여크레딧 갱신`);
  console.log(`   삭제: npx tsx scripts/delete-dummy-reservations.ts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
