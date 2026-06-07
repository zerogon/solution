"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  announcementCreateSchema,
  announcementIdSchema,
  announcementUpdateSchema,
  markAnnouncementReadSchema,
  markAnnouncementsReadSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import { Role } from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    throw new Error("관리자 권한이 필요합니다.");
  }
  return session;
}

/** 공지 생성/수정/삭제 후 학생·선생님 화면(배지 포함)과 관리자 목록을 모두 갱신 */
function revalidateAnnouncements(id?: string) {
  revalidatePath("/admin/announcements");
  if (id) revalidatePath(`/admin/announcements/${id}`);
  // 레이아웃 단위로 갱신해야 네비 미읽음 배지가 다시 계산됨
  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/student/announcements");
  revalidatePath("/teacher/announcements");
  revalidatePath("/student"); // 홈 '최근 공지' 카드
}

export async function createAnnouncementAction(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdmin();
    const parsed = announcementCreateSchema.safeParse({
      title: formData.get("title"),
      content: formData.get("content"),
      isPublished: formData.get("isPublished") === "on",
      isPinned: formData.get("isPinned") === "on",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const created = await prisma.announcement.create({
      data: {
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        isPublished: parsed.data.isPublished,
        isPinned: parsed.data.isPinned,
        authorId: session.user.id,
        publishedAt: parsed.data.isPublished ? new Date() : null,
      },
      select: { id: true },
    });

    revalidateAnnouncements(created.id);
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "공지 등록에 실패했습니다.",
    };
  }
}

export async function updateAnnouncementAction(input: {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  isPinned: boolean;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = announcementUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const existing = await prisma.announcement.findUnique({
      where: { id: parsed.data.id },
      select: { publishedAt: true },
    });
    if (!existing) return { ok: false, message: "공지를 찾을 수 없습니다." };

    // 숨김→게시 전환 시 최초 게시 시각을 채운다.
    // 본문 편집은 읽음 상태를 초기화하지 않음(정보성 공지라 오탈자 수정에 전체 재알림은 소음).
    await prisma.announcement.update({
      where: { id: parsed.data.id },
      data: {
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        isPublished: parsed.data.isPublished,
        isPinned: parsed.data.isPinned,
        publishedAt:
          parsed.data.isPublished && existing.publishedAt === null
            ? new Date()
            : existing.publishedAt,
      },
    });

    revalidateAnnouncements(parsed.data.id);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "공지 수정에 실패했습니다.",
    };
  }
}

export async function deleteAnnouncementAction(input: {
  id: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = announcementIdSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    await prisma.announcement.delete({ where: { id: parsed.data.id } });
    revalidateAnnouncements();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "공지 삭제에 실패했습니다.",
    };
  }
}

export async function markAnnouncementReadAction(input: {
  announcementId: string;
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, message: "로그인이 필요합니다." };
    }
    const parsed = markAnnouncementReadSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    // 게시된 공지만 읽음 처리 (숨김 공지는 무시)
    const announcement = await prisma.announcement.findUnique({
      where: { id: parsed.data.announcementId },
      select: { isPublished: true },
    });
    if (!announcement?.isPublished) return { ok: true };

    // @@unique([announcementId, userId]) + skipDuplicates 로 멱등 처리
    await prisma.announcementRead.createMany({
      data: [{ announcementId: parsed.data.announcementId, userId: session.user.id }],
      skipDuplicates: true,
    });

    revalidatePath("/student", "layout");
    revalidatePath("/teacher", "layout");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "읽음 처리에 실패했습니다.",
    };
  }
}

/** 학생 홈 공지 팝업: 표시된 공지 여러 건을 한 번에 읽음 처리 */
export async function markAnnouncementsReadAction(input: {
  announcementIds: string[];
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, message: "로그인이 필요합니다." };
    }
    const parsed = markAnnouncementsReadSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    // 게시된 공지만 추려서 읽음 처리 (숨김 공지는 무시)
    const published = await prisma.announcement.findMany({
      where: { id: { in: parsed.data.announcementIds }, isPublished: true },
      select: { id: true },
    });
    if (published.length === 0) return { ok: true };

    // @@unique([announcementId, userId]) + skipDuplicates 로 멱등 처리
    await prisma.announcementRead.createMany({
      data: published.map((a) => ({
        announcementId: a.id,
        userId: session.user.id,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/student", "layout");
    revalidatePath("/teacher", "layout");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "읽음 처리에 실패했습니다.",
    };
  }
}
