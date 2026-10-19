"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSignedIn } from "@/lib/auth-helpers";
import { toActionError, type ActionResult } from "@/lib/errors";
import { createEntry, deleteEntry, updateEntry, type EntryInput } from "@/lib/leave-service";
import { entryIdSchema, leaveEntrySchema } from "@/lib/validators";
import { z } from "zod";

const LOGIN_REQUIRED = { ok: false, message: "로그인이 필요합니다." } as const;

/** 기록이 바뀌면 영향받는 화면 전부. */
function revalidate() {
  for (const p of ["/calendar", "/settings"]) revalidatePath(p);
}

function parseEntry(input: unknown): { ok: true; data: EntryInput } | { ok: false; message: string } {
  const parsed = leaveEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  return {
    ok: true,
    data: { type: d.type, startIso: d.startDate, endIso: d.endDate, manualDays: d.manualDays, memo: d.memo },
  };
}

export async function createLeaveEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = parseEntry(input);
  if (!parsed.ok) return parsed;
  try {
    const entry = await createEntry(prisma, parsed.data);
    revalidate();
    return { ok: true, data: { id: entry.id } };
  } catch (err) {
    return toActionError(err, "createLeaveEntry", "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function updateLeaveEntry(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const id = z.object({ id: z.uuid() }).safeParse(input);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const parsed = parseEntry(input);
  if (!parsed.ok) return parsed;
  try {
    await updateEntry(prisma, id.data.id, parsed.data);
    revalidate();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "updateLeaveEntry", "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function deleteLeaveEntry(input: unknown): Promise<ActionResult> {
  if (!(await isSignedIn())) return LOGIN_REQUIRED;
  const parsed = entryIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  try {
    await deleteEntry(prisma, parsed.data.id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "deleteLeaveEntry");
  }
}
