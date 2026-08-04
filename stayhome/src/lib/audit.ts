import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/generated/prisma/enums";

export async function writeAudit(input: {
  actorId?: string | null;
  actorEmail: string;
  action: AuditAction;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    userAgent = h.get("user-agent");
  } catch {
    // headers() may be unavailable outside a request scope; that's fine.
  }

  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail,
      action: input.action,
      targetId: input.targetId ?? null,
      metadata: (input.metadata ?? undefined) as never,
      ip,
      userAgent,
    },
  });
}
