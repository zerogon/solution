import { RoleNav } from "@/components/RoleNav";
import { BottomTabBar } from "@/components/BottomTabBar";
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
    <div className="flex min-h-dvh flex-col">
      <RoleNav badges={badges} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-8">
        {children}
      </main>
      <BottomTabBar role={Role.TEACHER} badges={badges} />
    </div>
  );
}
