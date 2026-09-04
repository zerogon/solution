import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, AuditTargetType } from "@/generated/prisma/enums";

export interface AuditInput {
  actorId: string;
  actorName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** 요청 컨텍스트 밖(스크립트·크론)에서는 headers()가 없으므로 조용히 null. */
async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * 감사 로그 기록. 트랜잭션 안에서 부르려면 `tx`를 넘긴다 — 본 작업이 롤백되면
 * 로그도 같이 사라져야 "했다고 적혔는데 안 된" 기록이 남지 않는다.
 */
export async function writeAudit(input: AuditInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const { ip, userAgent } = await requestMeta();
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      description: input.description ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ip,
      userAgent,
    },
  });
}
