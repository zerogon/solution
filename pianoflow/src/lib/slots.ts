import { Weekday } from "@/generated/prisma/enums";

export const SLOT_HOURS = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
] as const;

/** 예약 행위가 허용되는 시각 창 (KST 자정 이후 경과 분) — 낮 12:00 ~ 밤 22:30 */
export const BOOKING_OPEN_MIN = 12 * 60; // 12:00
export const BOOKING_CLOSE_MIN = 22 * 60 + 30; // 22:30

/** 레슨 당일 00:00 KST에서 90분 전 = 전날 22:30 KST */
const CANCEL_DEADLINE_OFFSET_MS = 90 * 60 * 1000;

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

/** 예약 가능 주차 수 (이번 주 포함). 튜닝 지점. */
export const BOOKING_WEEKS_AHEAD = 4;

/**
 * 예약 가능 창 (KST). 이번 주 월요일을 앵커로 4주차 일요일까지.
 * 요청 시점마다 재계산되므로 매주 월요일 0시(KST)에 창이 자동으로 한 주 전진한다.
 */
export function bookingHorizon(now: Date = new Date()): {
  mondayStr: string; // 이번 주 월요일 (오늘 포함 주)
  minDateStr: string; // 예약 가능한 가장 이른 날 = 내일 (당일 예약 불가)
  maxDateStr: string; // 예약 가능한 가장 늦은 날(포함) = 4주차 일요일
} {
  const todayStr = formatKstDate(now);
  const dow = new Date(
    parseKstDate(todayStr).getTime() + KST_OFFSET_MS,
  ).getUTCDay(); // 0=일 .. 6=토
  const addStr = (s: string, n: number) =>
    formatKstDate(new Date(parseKstDate(s).getTime() + n * 86400000));
  const mondayStr = addStr(todayStr, dow === 0 ? -6 : 1 - dow);
  return {
    mondayStr,
    minDateStr: addStr(todayStr, 1),
    maxDateStr: addStr(mondayStr, BOOKING_WEEKS_AHEAD * 7 - 1), // +27
  };
}

/** KST 기준 시(0-23) */
export function kstHourOf(date: Date): number {
  return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
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

/** KST 기준 자정 이후 경과 분(0-1439) */
export function kstMinutesOfDay(date: Date): number {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** 레슨 취소 마감 시각(레슨 전날 22:30 KST) */
export function cancelDeadline(slotDatetime: Date): Date {
  const dayStartKst = parseKstDate(formatKstDate(slotDatetime)); // 레슨 당일 00:00 KST
  return new Date(dayStartKst.getTime() - CANCEL_DEADLINE_OFFSET_MS);
}

/** 학생이 지금 취소 가능한지 (마감 전인지) */
export function canStudentCancel(slotDatetime: Date, now: Date = new Date()): boolean {
  return now.getTime() <= cancelDeadline(slotDatetime).getTime();
}

export interface GenerateSlotsArgs {
  dateStr: string;                  // KST 기준 선택 일자
  availabilityByWeekday: Map<Weekday, number[]>; // 요일 → 예약 가능 시각. 없으면 그날 불가
  overrideHours?: number[] | null;  // 날짜 예외. undefined=예외없음(요일 기본), []=휴무, [..]=지정
  bookedSlotIsos: string[];         // 이미 예약된 슬롯의 ISO 문자열
  myActiveSlotIsos: string[];       // 내가 ACTIVE로 잡은 슬롯
  now?: Date;                       // 테스트용 시각 주입
}

/** TeacherAvailability 행 목록 → 요일별 가용 시각 Map */
export function availabilityMap(
  rows: { weekday: Weekday; hours: number[] }[],
): Map<Weekday, number[]> {
  return new Map(rows.map((r) => [r.weekday, r.hours]));
}

/**
 * 특정 날짜의 유효 예약 가능 시각을 결정. 날짜 예외가 있으면 요일 기본값을 완전히 덮어쓴다.
 * @returns 그날 가능한 시각 배열(빈 배열=휴무). 요일 기본값도 없으면 undefined.
 */
export function resolveDayHours(
  dateStr: string,
  availabilityByWeekday: Map<Weekday, number[]>,
  overrideHours?: number[] | null,
): number[] | undefined {
  if (overrideHours !== undefined && overrideHours !== null) {
    return overrideHours;
  }
  return availabilityByWeekday.get(weekdayOf(parseKstDate(dateStr)));
}

export function generateSlots({
  dateStr,
  availabilityByWeekday,
  overrideHours,
  bookedSlotIsos,
  myActiveSlotIsos,
  now = new Date(),
}: GenerateSlotsArgs): Slot[] {
  const baseDate = parseKstDate(dateStr);
  const allowedHours = resolveDayHours(
    dateStr,
    availabilityByWeekday,
    overrideHours,
  );
  const isAvailableDay = allowedHours !== undefined && allowedHours.length > 0;
  const hourSet = new Set(allowedHours ?? []);
  const isToday = isSameKstDay(baseDate, now);
  const isPast = baseDate.getTime() < parseKstDate(formatKstDate(now)).getTime();
  const isBeyondHorizon = dateStr > bookingHorizon(now).maxDateStr;

  const booked = new Set(bookedSlotIsos);
  const mine = new Set(myActiveSlotIsos);

  return SLOT_HOURS.map((hour) => {
    const slot = slotDatetime(dateStr, hour);
    const iso = slot.toISOString();

    if (!isAvailableDay || isPast || isBeyondHorizon) {
      return { hour, iso, state: "unavailable" as const };
    }
    if (isToday && slot.getTime() <= now.getTime()) {
      return { hour, iso, state: "unavailable" as const };
    }
    if (!hourSet.has(hour)) {
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
