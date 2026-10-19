"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSignedIn } from "@/lib/auth-helpers";
import { toActionError, type ActionResult } from "@/lib/errors";
import { leaveYearSchema, ownerSettingsSchema, yearOnlySchema } from "@/lib/validators";

const LOGIN_REQUIRED = { ok: false, message: "로그인이 필요합니다." } as const;

function revalidateAll() {
  // 이름은 셸에, 부여는 모든 요약에 보인다.
  revalidatePath("/", "layout");
}

/**
 * 이름·쉬는 요일. 쉬는 요일을 바꿔도 **이미 저장된 기록의 일수는 다시 계산하지 않는다** —
 * 그 날 실제로 깎인 일수가 장부의 사실이다. 바뀐 규칙은 이후 기록(과 수정)에만 적용된다.
 */
export async function updateOwnerSettings(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = ownerSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await prisma.owner.update({
      where: { id: "owner" },
      data: { name: parsed.data.name, closedWeekdays: [...new Set(parsed.data.closedWeekdays)].sort() },
    });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "updateOwnerSettings");
  }
}

/** 연도별 부여 추가·수정(같은 연도면 덮어쓴다). */
export async function saveLeaveYear(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = leaveYearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { year, ...data } = parsed.data;
  try {
    await prisma.leaveYear.upsert({ where: { year }, update: data, create: { year, ...data } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "saveLeaveYear");
  }
}

/** 부여만 지운다. 그 해의 기록은 남는다(잔여가 음수로 보일 뿐). */
export async function deleteLeaveYear(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = yearOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  try {
    await prisma.leaveYear.deleteMany({ where: { year: parsed.data.year } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "deleteLeaveYear");
  }
}
