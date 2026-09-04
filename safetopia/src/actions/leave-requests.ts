"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { toActionError, type ActionResult } from "@/lib/errors";
import {
  adminCancelRequest,
  approveLeaveRequest as approveSvc,
  cancelOwnPendingRequest as cancelOwnSvc,
  createLeaveRequest as createSvc,
  rejectLeaveRequest as rejectSvc,
} from "@/lib/leave-service";
import { adminCancelSchema, leaveRequestSchema, rejectSchema, requestIdSchema } from "@/lib/validators";

const UNAUTHORIZED = { ok: false, message: "관리자만 사용할 수 있습니다." } as const;
const LOGIN_REQUIRED = { ok: false, message: "로그인이 필요합니다." } as const;

/** 상태 전이 후 영향받는 화면 전부. 직원·관리자 양쪽. */
function revalidate(userId?: string) {
  for (const p of ["/dashboard", "/leave/history", "/calendar", "/profile", "/admin/dashboard", "/admin/leaves", "/admin/employees", "/admin/calendar"]) {
    revalidatePath(p);
  }
  if (userId) revalidatePath(`/admin/employees/${userId}`);
}

export async function createLeaveRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return LOGIN_REQUIRED;
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const req = await createSvc(prisma, {
      userId: session.user.id,
      type: parsed.data.type,
      startIso: parsed.data.startDate,
      endIso: parsed.data.endDate,
      reason: parsed.data.reason,
    });
    revalidate(session.user.id);
    return { ok: true, data: { id: req.id } };
  } catch (err) {
    return toActionError(err, "createLeaveRequest", "신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function cancelOwnPendingRequest(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return LOGIN_REQUIRED;
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    await cancelOwnSvc(prisma, { requestId: parsed.data.id, userId: session.user.id });
    revalidate(session.user.id);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "cancelOwnPendingRequest");
  }
}

export async function approveLeaveRequest(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const req = await approveSvc(prisma, { requestId: parsed.data.id, actor: { id: session.user.id, name: session.user.name } });
    revalidate(req.userId);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "approveLeaveRequest");
  }
}

export async function rejectLeaveRequest(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const req = await rejectSvc(prisma, {
      requestId: parsed.data.id,
      reason: parsed.data.reason,
      actor: { id: session.user.id, name: session.user.name },
    });
    revalidate(req.userId);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "rejectLeaveRequest");
  }
}

export async function adminCancelLeaveRequest(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = adminCancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const req = await adminCancelRequest(prisma, {
      requestId: parsed.data.id,
      reason: parsed.data.reason,
      actor: { id: session.user.id, name: session.user.name },
    });
    revalidate(req.userId);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "adminCancelLeaveRequest");
  }
}
