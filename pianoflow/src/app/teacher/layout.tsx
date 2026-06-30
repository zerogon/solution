import { AppShell } from "@/components/app-shell/AppShell";
import { requireRole } from "@/lib/auth-helpers";
import { getUnreadAnnouncementCount } from "@/lib/announcements";
import { Role } from "@/generated/prisma/enums";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(Role.TEACHER, Role.ADMIN);

  // 안 읽은 공지 개수 → 네비 '공지' 탭 빨간 배지
  const unreadAnnouncements = await getUnreadAnnouncementCount(session.user.id);
  const badges = { "/teacher/announcements": unreadAnnouncements };

  return (
    <AppShell role={Role.TEACHER} userName={session.user.name} badges={badges}>
      {children}
    </AppShell>
  );
}
