"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSignedIn } from "@/lib/auth-helpers";
import { toActionError, type ActionResult } from "@/lib/errors";
import { leavePeriodSchema, ownerSettingsSchema, periodIndexSchema } from "@/lib/validators";
import { parseDate, todayKstIso } from "@/lib/utils";

const LOGIN_REQUIRED = { ok: false, message: "로그인이 필요합니다." } as const;

function revalidateAll() {
  // 이름은 셸에, 부여는 모든 요약에 보인다.
  revalidatePath("/", "layout");
}

/**
 * 이름·입사일. 쉬는 요일은 화면에서 뺐으므로(2026-11-06) 여기서도 받지 않는다 — DB 값은 그대로 둔다.
 * 입사일을 바꾸면 회차 경계가 전부 다시 계산된다(저장된 것이 없으므로 재정렬은 없다). 경계에 걸치게 된
 * 기록은 다음 수정 때 `period_boundary`로 막힌다 — 나눠서 다시 등록해야 한다.
 */
export async function updateOwnerSettings(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = ownerSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (parsed.data.hireDate > todayKstIso()) return { ok: false, message: "입사일은 오늘 이전이어야 합니다." };
  try {
    await prisma.owner.update({
      where: { id: "owner" },
      data: { name: parsed.data.name, hireDate: parseDate(parsed.data.hireDate) },
    });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "updateOwnerSettings");
  }
}

/** 회차 조정(이월·보정·메모) 저장. 같은 회차면 덮어쓴다. */
export async function savePeriodAdjustment(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = leavePeriodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { index, ...data } = parsed.data;
  try {
    await prisma.leavePeriod.upsert({ where: { index }, update: data, create: { index, ...data } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "savePeriodAdjustment");
  }
}

/** 조정만 지운다 — 발생 일수(자동 계산)와 그 회차의 기록은 그대로다. */
export async function deletePeriodAdjustment(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = periodIndexSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  try {
    await prisma.leavePeriod.deleteMany({ where: { index: parsed.data.index } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "deletePeriodAdjustment");
  }
}
