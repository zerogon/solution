import { z } from "zod";

/** 참여자 이름 — 로그인이 없으므로 이 문자열이 곧 신원이다. 앞뒤 공백 제거, 1~20자. */
export const memberNameSchema = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(20, "이름은 20자까지입니다.");

export const createEventSchema = z.object({
  title: z.string().trim().max(40, "제목은 40자까지입니다.").optional(),
  naverUrl: z.string().trim().min(1, "네이버 링크를 입력해 주세요.").max(2000),
});

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
export type CustomMenuInput = z.infer<typeof customMenuSchema>;
export type PickInput = z.infer<typeof pickSchema>;
