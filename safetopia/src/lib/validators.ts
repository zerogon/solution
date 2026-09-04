import { z } from "zod";
import { EmployeeStatus, LeaveType, Role } from "@/generated/prisma/enums";

// ───────────────────────── 공통 ─────────────────────────

export const passwordSchema = z
  .string()
  .min(4, "비밀번호는 최소 4자 이상이어야 합니다.")
  .max(64, "비밀번호가 너무 깁니다.");

export const loginIdSchema = z
  .string()
  .trim()
  .min(3, "아이디는 3자 이상이어야 합니다.")
  .max(30, "아이디는 30자 이하여야 합니다.")
  .regex(/^[a-z0-9._-]+$/, "아이디는 영문 소문자·숫자·._- 만 사용할 수 있습니다.");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");

/** 0.5 단위 수치. `Number.isInteger(v * 2)`가 곧 정의다. */
const halfStep = (msg: string) => (v: number) => Number.isInteger(v * 2) || msg;

export const loginSchema = z.object({
  loginId: loginIdSchema,
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

// ───────────────────────── 직원 ─────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const employeeBase = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(30),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "이메일 형식이 올바르지 않습니다."),
  phone: optionalText(20),
  role: z.enum(Role),
  branchId: z.string().trim().optional().transform((v) => (v ? v : null)),
  hireDate: isoDateSchema.optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

/** 직원은 지점·입사일이 필수, 관리자는 선택. */
function requireEmployeeFields(
  d: { role: Role; branchId: string | null; hireDate: string | null },
  ctx: z.RefinementCtx,
) {
  if (d.role !== Role.EMPLOYEE) return;
  if (!d.branchId) {
    ctx.addIssue({ code: "custom", message: "소속 지점을 선택해주세요.", path: ["branchId"] });
  }
  if (!d.hireDate) {
    ctx.addIssue({ code: "custom", message: "입사일을 입력해주세요.", path: ["hireDate"] });
  }
}

export const employeeCreateSchema = employeeBase
  .extend({
    loginId: loginIdSchema,
    initialPassword: passwordSchema.optional().or(z.literal("")).transform((v) => (v ? v : null)),
    /** 올해 기본 부여 연차. 비우면 잔액 행을 만들지 않는다. */
    totalDays: z
      .number()
      .min(0)
      .max(60)
      .refine(halfStep("0.5일 단위로 입력해주세요."))
      .optional(),
  })
  .superRefine(requireEmployeeFields);

export const employeeUpdateSchema = employeeBase
  .extend({ id: z.uuid() })
  .superRefine(requireEmployeeFields);

export const employeeStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(EmployeeStatus),
});

export const employeeBranchChangeSchema = z.object({
  id: z.uuid(),
  toBranchId: z.uuid("이동할 지점을 선택해주세요."),
  reason: optionalText(200),
});

export const resetPasswordSchema = z.object({
  id: z.uuid(),
  newPassword: passwordSchema.optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

// ───────────────────────── 지점 ─────────────────────────

export const branchSchema = z.object({
  name: z.string().trim().min(1, "지점명을 입력해주세요.").max(40),
  address: optionalText(120),
  phone: optionalText(20),
  closedWeekdays: z
    .array(z.number().int().min(0).max(6))
    .max(6, "휴무 요일은 최대 6일까지 지정할 수 있습니다.")
    .default([]),
  minStaff: z.number().int().min(0).max(99).nullable().optional(),
});

export const branchUpdateSchema = branchSchema.extend({ id: z.uuid() });

export const branchStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// ───────────────────────── 연차 잔액 ─────────────────────────

export const leaveGrantSchema = z.object({
  userId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  totalDays: z.number().min(0).max(60).refine(halfStep("0.5일 단위로 입력해주세요.")),
  carriedOverDays: z.number().min(0).max(60).refine(halfStep("0.5일 단위로 입력해주세요.")),
});

export const leaveAdjustSchema = z.object({
  userId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  amount: z
    .number()
    .min(-60)
    .max(60)
    .refine(halfStep("0.5일 단위로 입력해주세요."))
    .refine((v) => v !== 0, "조정 수치는 0이 될 수 없습니다."),
  reason: z.string().trim().min(1, "조정 사유를 입력해주세요.").max(300),
});

// ───────────────────────── 연차 신청 ─────────────────────────

export const leaveRequestSchema = z
  .object({
    type: z.enum(LeaveType),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    // 연차 사유 기능 비활성(2026-09-04) — 되살리려면 아래 한 줄로 교체.
    // reason: z.string().trim().min(1, "사유를 입력해주세요.").max(300, "사유는 300자 이내로 입력해주세요."),
    reason: z.string().trim().max(300).optional().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.type !== LeaveType.FULL_DAY && d.startDate !== d.endDate) {
      ctx.addIssue({ code: "custom", message: "반차는 하루만 선택할 수 있습니다.", path: ["endDate"] });
    }
    if (d.startDate > d.endDate) {
      ctx.addIssue({ code: "custom", message: "종료일이 시작일보다 앞설 수 없습니다.", path: ["endDate"] });
    }
    if (d.startDate.slice(0, 4) !== d.endDate.slice(0, 4)) {
      ctx.addIssue({ code: "custom", message: "연도를 넘기는 신청은 나눠서 해주세요.", path: ["endDate"] });
    }
  });

export const requestIdSchema = z.object({ id: z.uuid() });

export const rejectSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, "반려 사유를 입력해주세요.").max(300),
});

export const adminCancelSchema = z.object({
  id: z.uuid(),
  reason: optionalText(300),
});
