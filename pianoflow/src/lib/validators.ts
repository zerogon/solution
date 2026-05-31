import { z } from "zod";
import { Role, Weekday } from "@/generated/prisma/enums";
import { SLOT_HOURS } from "@/lib/slots";

const ALLOWED_HOURS = new Set<number>(SLOT_HOURS);

export const phoneSchema = z
  .string()
  .min(10, "휴대폰 번호를 입력해주세요.")
  .regex(/^[0-9-]+$/, "휴대폰 번호 형식이 올바르지 않습니다.");

export const passwordSchema = z
  .string()
  .min(4, "비밀번호는 최소 4자 이상이어야 합니다.")
  .max(64, "비밀번호가 너무 깁니다.");

export const loginIdSchema = z
  .string()
  .regex(/^\d{8}$/, "로그인 ID는 숫자 8자리입니다.");

export const loginSchema = z.object({
  loginId: loginIdSchema,
  // 학생은 비밀번호 없이 로그인 → 선택값. 선생님/관리자는 authorize에서 필수 처리.
  password: z.string().optional(),
});

export const teacherCredentialSchema = z
  .object({
    teacherId: z.string().uuid(),
    loginId: loginIdSchema.optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((d) => d.loginId !== undefined || d.newPassword !== undefined, {
    message: "변경할 로그인 ID 또는 비밀번호를 입력해주세요.",
    path: ["loginId"],
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

export const memberCreateSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").max(30),
  phone: phoneSchema,
  role: z.nativeEnum(Role).default(Role.STUDENT),
  remainingLessons: z.number().int().min(0).default(0),
});

export const memberUpdateSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  phone: phoneSchema.optional(),
  role: z.nativeEnum(Role).optional(),
  remainingLessons: z.number().int().min(0).optional(),
});

export const availabilitySchema = z.object({
  teacherId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        weekday: z.nativeEnum(Weekday),
        hours: z
          .array(
            z
              .number()
              .int()
              .refine((h) => ALLOWED_HOURS.has(h), "허용되지 않은 시간입니다."),
          )
          .min(1, "각 요일은 최소 1개 시간을 선택해야 합니다."),
      }),
    )
    .superRefine((entries, ctx) => {
      const seen = new Set<Weekday>();
      for (const e of entries) {
        if (seen.has(e.weekday)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "요일이 중복되었습니다.",
          });
        }
        seen.add(e.weekday);
      }
    }),
});

const dateStrSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식(YYYY-MM-DD)이 올바르지 않습니다.");

export const enrollmentPeriodSchema = z
  .object({
    studentId: z.string().uuid(),
    start: dateStrSchema.nullable(),
    end: dateStrSchema.nullable(),
  })
  .refine((d) => (d.start === null) === (d.end === null), {
    message: "시작일과 종료일을 함께 입력하거나 함께 비워주세요.",
    path: ["end"],
  })
  .refine((d) => !d.start || !d.end || d.start <= d.end, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["end"],
  });

export const lessonAdjustSchema = z.object({
  studentId: z.string().uuid(),
  delta: z.number().int(),
  memo: z.string().max(200).optional(),
});

export const reservationCreateSchema = z.object({
  teacherId: z.string().uuid(),
  slotIso: z.string().datetime(),
  studentId: z.string().uuid().optional(), // 관리자 강제 예약용
});

export const reservationCancelSchema = z.object({
  reservationId: z.string().uuid(),
});

export const reservationVisibilitySchema = z.object({
  reservationId: z.string().uuid(),
  isPrivate: z.boolean(),
});
