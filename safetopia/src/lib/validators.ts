import { z } from "zod";
import { LeaveType } from "@/generated/prisma/enums";

// ───────────────────────── 공통 ─────────────────────────

export const passwordSchema = z
  .string()
  .min(4, "비밀번호는 최소 4자 이상이어야 합니다.")
  .max(64, "비밀번호가 너무 깁니다.");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");

/** 0.5 단위 수치. `Number.isInteger(v * 2)`가 곧 정의다. */
const halfStep = (msg: string) => (v: number) => Number.isInteger(v * 2) || msg;

const halfDays = (max: number) =>
  z
    .number({ error: "숫자를 입력해주세요." })
    .min(0, "0 이상이어야 합니다.")
    .max(max, `${max}일 이하로 입력해주세요.`)
    .refine(halfStep("0.5일 단위로 입력해주세요."));

export const loginSchema = z.object({
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요."),
    newPassword: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "새 비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"],
  });

// ───────────────────────── 설정 ─────────────────────────

export const ownerSettingsSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(30),
  closedWeekdays: z
    .array(z.number().int().min(0).max(6))
    .max(6, "쉬는 요일은 최대 6일까지 지정할 수 있습니다.")
    .default([]),
});

export const leaveYearSchema = z.object({
  year: z.number().int().min(2000, "연도를 확인해주세요.").max(2100, "연도를 확인해주세요."),
  grantedDays: halfDays(60),
  carriedOverDays: halfDays(60),
  memo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export const yearOnlySchema = z.object({ year: z.number().int() });

// ───────────────────────── 연차 기록 ─────────────────────────

export const leaveEntrySchema = z
  .object({
    type: z.enum(LeaveType),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    /** null = 자동 계산. */
    manualDays: halfDays(31).refine((v) => v > 0, "0보다 커야 합니다.").nullable(),
    memo: z.string().trim().max(200, "메모는 200자 이내로 입력해주세요.").default(""),
  })
  .superRefine((d, ctx) => {
    if (d.type !== LeaveType.FULL_DAY && d.startDate !== d.endDate) {
      ctx.addIssue({ code: "custom", message: "반차는 하루만 선택할 수 있습니다.", path: ["endDate"] });
    }
    if (d.startDate > d.endDate) {
      ctx.addIssue({ code: "custom", message: "종료일이 시작일보다 앞설 수 없습니다.", path: ["endDate"] });
    }
  });

export const entryIdSchema = z.object({ id: z.uuid() });
