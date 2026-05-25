import { z } from "zod";
import { Role, Weekday } from "@/generated/prisma/enums";

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
  .regex(/^\d{4}[a-z]$/, "로그인 ID는 숫자4자리+영문1자 형식입니다.");

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
  weekdays: z.array(z.nativeEnum(Weekday)),
});

export const creditAdjustSchema = z.object({
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
