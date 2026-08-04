import { z } from "zod";

export const loginSchema = z.object({
  loginId: z.string().min(1, "ID를 입력하세요").max(50),
  password: z.string().min(1, "비밀번호를 입력하세요").max(200),
});

export const resortAccountSchema = z.object({
  resortId: z.string().uuid(),
  label: z.string().min(1, "라벨을 입력하세요").max(50),
  loginId: z.string().min(1, "ID를 입력하세요").max(200),
  password: z.string().min(1, "비밀번호를 입력하세요").max(200),
  memo: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export type ResortAccountInput = z.infer<typeof resortAccountSchema>;

export const resortAccountUpdateSchema = resortAccountSchema.partial({
  loginId: true,
  password: true,
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

export const searchParamsSchema = z
  .object({
    checkin: isoDate,
    checkout: isoDate,
    branch: z.string().optional(),
  })
  .refine((v) => v.checkout > v.checkin, {
    message: "체크아웃은 체크인 이후여야 합니다",
    path: ["checkout"],
  });

export type SearchParamsInput = z.infer<typeof searchParamsSchema>;

/** User-facing cache read: filter by branch (= ResortInventory.branchName). */
export const inventoryQuerySchema = z
  .object({
    checkin: isoDate,
    checkout: isoDate,
    branch: z.string().optional(),
  })
  .refine((v) => v.checkout > v.checkin, {
    message: "체크아웃은 체크인 이후여야 합니다",
    path: ["checkout"],
  });

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;
