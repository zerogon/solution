import { z } from "zod";

import { ResortSlug } from "@/generated/prisma/enums";

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

/**
 * 지점 제외 규칙 하나. `branchName`은 `config.branches[].value`와 문자 단위로 같아야
 * 하는데, 그 대조는 여기(형식)가 아니라 `excludeProperty`(카탈로그)가 한다 — zod는
 * 그 리조트가 무엇인지 모른다.
 */
export const branchExclusionSchema = z.object({
  resortId: z.string().uuid(),
  branchName: z.string().min(1, "지점을 선택하세요").max(100),
  reason: z.string().max(200).optional().nullable(),
});

export type BranchExclusionInput = z.infer<typeof branchExclusionSchema>;

/**
 * 운영자가 손으로 넣는 1박 단가 하나.
 *
 * ⚠️ `branchExclusionSchema`와 달리 `resortId`가 아니라 **슬러그**를 받는다. 이 액션의
 * 주 호출부가 조회 화면인데 `getSearchCatalog()`는 DB id를 클라이언트에 내려보내지 않고,
 * 내려보내게 만드는 것은 이 저장소가 일부러 피해 온 방향이다(`resort-catalog.ts` 주석).
 * id 조회는 액션 안에서 한다.
 *
 * `roomType`은 형식만 본다 — 대조할 카탈로그가 없다(객실유형은 사이트가 정하고 한화만
 * 107종이다). 그 대신 입력 다이얼로그가 항상 실제 조회 행에서 열려 사람이 타이핑하지 않는다.
 */
export const roomRateSchema = z.object({
  resortSlug: z.nativeEnum(ResortSlug),
  branchName: z.string().min(1, "지점이 필요합니다").max(100),
  roomType: z.string().min(1, "객실 유형이 필요합니다").max(200),
  /**
   * 1박 단가(원). 이 파일의 첫 숫자 스키마라 `z.coerce`가 필요하다 — 폼 입력은 문자열로 온다.
   *
   * 0과 음수는 "요금 없음"과 뜻이 겹치므로 거부한다. 상한 1,000만 원은 자릿수 오타를
   * 다 잡지는 못하지만(120,000 → 1,200,000은 통과한다) **단위 착각**은 대개 잡는다 —
   * 이 칸에 숙박 총액을 넣는 실수가 가장 그럴듯한 오류다.
   */
  perNight: z.coerce
    .number({ invalid_type_error: "숫자를 입력하세요" })
    .int("원 단위 정수로 입력하세요")
    .min(1, "1원 이상이어야 합니다")
    .max(10_000_000, "1박 단가가 너무 큽니다 — 숙박 총액을 넣지 않았는지 확인하세요"),
  note: z.string().max(200).optional().nullable(),
});

export type RoomRateInput = z.infer<typeof roomRateSchema>;

/** 삭제는 키 세 값만 필요하다. */
export const roomRateKeySchema = roomRateSchema.pick({
  resortSlug: true,
  branchName: true,
  roomType: true,
});

export type RoomRateKeyInput = z.infer<typeof roomRateKeySchema>;

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

/**
 * User-facing cache read.
 *
 * `resort` is the only server-side narrowing axis — it is low-cardinality (≤5) and
 * is what actually bounds the payload. Region and property filtering happens on the
 * client (`matchesPlace`) so that every chip's availability badge comes for free
 * without a round trip per chip.
 *
 * `branch` (= `ResortInventory.branchName`) stays for compatibility with any cached
 * URL the service worker still holds; the search UI no longer sends it.
 */
export const inventoryQuerySchema = z
  .object({
    checkin: isoDate,
    checkout: isoDate,
    resort: z.nativeEnum(ResortSlug).optional(),
    branch: z.string().optional(),
  })
  .refine((v) => v.checkout > v.checkin, {
    message: "체크아웃은 체크인 이후여야 합니다",
    path: ["checkout"],
  });

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;
