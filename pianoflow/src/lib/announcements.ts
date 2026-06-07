import { prisma } from "@/lib/prisma";

/**
 * 특정 사용자(학생·선생님)가 아직 읽지 않은 게시 공지 개수.
 * 네비 배지(빨간 알림)와 홈 카드에서 재사용한다.
 */
export async function getUnreadAnnouncementCount(userId: string): Promise<number> {
  return prisma.announcement.count({
    where: {
      isPublished: true,
      reads: { none: { userId } },
    },
  });
}

/**
 * 게시 공지 목록 + 해당 사용자의 읽음 여부.
 * reads.length === 0 이면 미읽음("새 공지").
 * limit을 주면 최신 N건만(홈 미리보기 카드용).
 */
export async function listPublishedAnnouncements(userId: string, limit?: number) {
  return prisma.announcement.findMany({
    where: { isPublished: true },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    include: { reads: { where: { userId }, select: { id: true } } },
    ...(limit ? { take: limit } : {}),
  });
}

/**
 * 해당 사용자가 아직 읽지 않은 게시 공지(전체 본문 포함).
 * 학생 홈 자동 팝업에서 사용 — 보통 소수라 limit 없이 조회.
 */
export async function listUnreadAnnouncements(userId: string) {
  return prisma.announcement.findMany({
    where: { isPublished: true, reads: { none: { userId } } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
  });
}
