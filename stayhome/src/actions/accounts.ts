"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { encrypt } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma/enums";
import { resortAccountSchema, resortAccountUpdateSchema } from "@/lib/validators";

export async function createResortAccount(input: unknown) {
  const session = await requireSession();
  const parsed = resortAccountSchema.parse(input);

  const account = await prisma.resortAccount.create({
    data: {
      resortId: parsed.resortId,
      label: parsed.label,
      idEncrypted: encrypt(parsed.loginId),
      pwEncrypted: encrypt(parsed.password),
      memo: parsed.memo ?? null,
      isPrimary: parsed.isPrimary ?? true,
    },
  });

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.CREATE_ACCOUNT,
    targetId: account.id,
    metadata: { resortId: parsed.resortId, label: parsed.label },
  });

  revalidatePath("/admin/accounts");
  return { id: account.id };
}

export async function updateResortAccount(
  id: string,
  input: unknown,
) {
  const session = await requireSession();
  const parsed = resortAccountUpdateSchema.parse(input);

  const data: Record<string, unknown> = {};
  if (parsed.label !== undefined) data.label = parsed.label;
  if (parsed.memo !== undefined) data.memo = parsed.memo;
  if (parsed.isPrimary !== undefined) data.isPrimary = parsed.isPrimary;
  if (parsed.loginId) data.idEncrypted = encrypt(parsed.loginId);
  if (parsed.password) data.pwEncrypted = encrypt(parsed.password);

  await prisma.resortAccount.update({ where: { id }, data });

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.UPDATE_ACCOUNT,
    targetId: id,
    metadata: {
      changedFields: Object.keys(data),
      credentialUpdated: Boolean(parsed.loginId || parsed.password),
    },
  });

  revalidatePath("/admin/accounts");
}

export async function deleteResortAccount(id: string) {
  const session = await requireSession();
  await prisma.resortAccount.delete({ where: { id } });

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.DELETE_ACCOUNT,
    targetId: id,
  });

  revalidatePath("/admin/accounts");
}
