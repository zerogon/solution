import { Weekday } from "@/generated/prisma/enums";

export const SLOT_HOURS = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
] as const;

export type SlotState = "available" | "booked" | "mine" | "unavailable";

export interface Slot {
  hour: number;
  iso: string;
  state: SlotState;
}

const WEEKDAY_MAP: Record<number, Weekday> = {
  0: Weekday.SUN,
  1: Weekday.MON,
  2: Weekday.TUE,
  3: Weekday.WED,
  4: Weekday.THU,
  5: Weekday.FRI,
  6: Weekday.SAT,
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** YYYY-MM-DD (KST 기준) → 해당 일자 KST 자정의 UTC Date */
export function parseKstDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  }
  const [, y, m, d] = match;
  // KST 자정 = UTC 전날 15:00
  return new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d)) - KST_OFFSET_MS,
  );
}

export function formatKstDate(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekdayOf(date: Date): Weekday {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return WEEKDAY_MAP[kst.getUTCDay()];
}

/** KST 기준 특정 일자의 특정 시(HH)에 해당하는 UTC Date */
export function slotDatetime(dateStr: string, hour: number): Date {
  const base = parseKstDate(dateStr);
  return new Date(base.getTime() + hour * 60 * 60 * 1000);
}

/** KST 기준 같은 달력 일자인지 */
export function isSameKstDay(a: Date, b: Date): boolean {
  return formatKstDate(a) === formatKstDate(b);
}

export interface GenerateSlotsArgs {
  dateStr: string;                  // KST 기준 선택 일자
  teacherWeekdays: Weekday[];       // 선생님 가용 요일
  bookedSlotIsos: string[];         // 이미 예약된 슬롯의 ISO 문자열
  myActiveSlotIsos: string[];       // 내가 ACTIVE로 잡은 슬롯
  now?: Date;                       // 테스트용 시각 주입
}

export function generateSlots({
  dateStr,
  teacherWeekdays,
  bookedSlotIsos,
  myActiveSlotIsos,
  now = new Date(),
}: GenerateSlotsArgs): Slot[] {
  const baseDate = parseKstDate(dateStr);
  const weekday = weekdayOf(baseDate);
  const isAvailableDay = teacherWeekdays.includes(weekday);
  const isToday = isSameKstDay(baseDate, now);
  const isPast = baseDate.getTime() < parseKstDate(formatKstDate(now)).getTime();

  const booked = new Set(bookedSlotIsos);
  const mine = new Set(myActiveSlotIsos);

  return SLOT_HOURS.map((hour) => {
    const slot = slotDatetime(dateStr, hour);
    const iso = slot.toISOString();

    if (!isAvailableDay || isPast) {
      return { hour, iso, state: "unavailable" as const };
    }
    if (isToday && slot.getTime() <= now.getTime()) {
      return { hour, iso, state: "unavailable" as const };
    }
    if (mine.has(iso)) {
      return { hour, iso, state: "mine" as const };
    }
    if (booked.has(iso)) {
      return { hour, iso, state: "booked" as const };
    }
    return { hour, iso, state: "available" as const };
  });
}
