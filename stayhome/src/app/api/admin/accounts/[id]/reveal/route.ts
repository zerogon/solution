import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma/enums";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  const account = await prisma.resortAccount.findUnique({
    where: { id },
    include: { resort: { select: { name: true, slug: true } } },
  });
  if (!account) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let loginId: string;
  let password: string;
  try {
    loginId = decrypt(account.idEncrypted);
    password = decrypt(account.pwEncrypted);
  } catch {
    return NextResponse.json({ error: "decrypt_failed" }, { status: 500 });
  }

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.REVEAL_CREDENTIAL,
    targetId: id,
    metadata: {
      resortSlug: account.resort.slug,
      label: account.label,
    },
  });

  return NextResponse.json({ loginId, password });
}
