import { z } from "zod";

/** 참여자 이름 — 로그인이 없으므로 이 문자열이 곧 신원이다. 앞뒤 공백 제거, 1~20자. */
export const memberNameSchema = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(20, "이름은 20자까지입니다.");

/** 'YYYY-MM-DD' 이고 실제로 존재하는 날짜(2026-02-30 같은 값 거부). */
export const eventDateSchema = z
  .string({ required_error: "회식 날짜를 선택해 주세요.", invalid_type_error: "회식 날짜를 선택해 주세요." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "회식 날짜를 선택해 주세요.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "존재하지 않는 날짜입니다.");

export const headcountSchema = z
  .number({ required_error: "예상 인원을 입력해 주세요.", invalid_type_error: "예상 인원은 숫자여야 합니다." })
  .int("인원은 정수여야 합니다.")
  .min(1, "인원은 1명 이상이어야 합니다.")
  .max(500, "인원은 500명까지입니다.");

const titleSchema = z.string().trim().max(40, "제목은 40자까지입니다.");

export const createEventSchema = z.object({
  title: titleSchema.optional(),
  naverUrl: z.string().trim().min(1, "네이버 링크를 입력해 주세요.").max(2000),
  eventDate: eventDateSchema,
  headcount: headcountSchema,
});

export const updateEventSchema = z
  .object({
    title: titleSchema.min(1, "제목을 입력해 주세요.").optional(),
    eventDate: eventDateSchema.optional(),
    headcount: headcountSchema.optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), "바꿀 내용이 없습니다.");

export const customMenuSchema = z.object({
  name: z.string().trim().min(1, "메뉴 이름을 입력해 주세요.").max(40, "메뉴 이름은 40자까지입니다."),
  /** 원 단위. 모르면 null → "가격 미정". */
  price: z.number().int().min(0).max(10_000_000).nullable().optional(),
  memberName: memberNameSchema,
});

export const pickSchema = z.object({
  menuId: z.number().int().positive(),
  memberName: memberNameSchema,
  /** 0이면 장바구니에서 뺀다. */
  quantity: z.number().int().min(0).max(99),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CustomMenuInput = z.infer<typeof customMenuSchema>;
export type PickInput = z.infer<typeof pickSchema>;
