import { z } from "zod";
import { LeaveType } from "@/generated/prisma/enums";

// ───────────────────────── 공통 ─────────────────────────

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

// ───────────────────────── 설정 ─────────────────────────

/** 0.5 단위, 음수 허용(보정용). */
const signedHalfDays = (max: number) =>
  z
    .number({ error: "숫자를 입력해주세요." })
    .min(-max, `-${max}일 이상이어야 합니다.`)
    .max(max, `${max}일 이하로 입력해주세요.`)
    .refine(halfStep("0.5일 단위로 입력해주세요."));

export const ownerSettingsSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(30),
  /** 한 번 넣으면 비울 수 없다 — 회차 조정 행의 뜻이 입사일에 달려 있다. 오늘 이후 금지는 액션에서. */
  hireDate: isoDateSchema.refine((v) => {
    const y = Number(v.slice(0, 4));
    return y >= 2000 && y <= 2100;
  }, "입사일을 확인해주세요."),
});

/** 회차별 조정. 발생 일수는 입력하지 않는다(입사일로 계산). */
export const leavePeriodSchema = z.object({
  index: z.number().int().min(1, "회차를 확인해주세요.").max(60, "회차를 확인해주세요."),
  carriedOverDays: halfDays(60),
  adjustedDays: signedHalfDays(60),
  memo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export const periodIndexSchema = z.object({ index: z.number().int().min(1) });

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
