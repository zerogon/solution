import { AppShell } from "@/components/app-shell/AppShell";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getUnreadAnnouncementCount } from "@/lib/announcements";
import { Role, ReservationStatus } from "@/generated/prisma/enums";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(Role.STUDENT, Role.ADMIN);

  // 안 읽은 선생님 피드백 / 공지 개수 → 네비 빨간 배지
  const [unread, unreadAnnouncements] = await Promise.all([
    prisma.reservation.count({
      where: {
        studentId: session.user.id,
        status: ReservationStatus.ACTIVE,
        feedback: { not: null },
        feedbackReadAt: null,
      },
    }),
    getUnreadAnnouncementCount(session.user.id),
  ]);
  const badges = {
    "/student/history": unread,
    "/student/announcements": unreadAnnouncements,
  };

  return (
    <AppShell role={Role.STUDENT} userName={session.user.name} badges={badges}>
      {children}
    </AppShell>
  );
}
