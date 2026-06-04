import { RoleNav } from "@/components/RoleNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { requireRole } from "@/lib/auth-helpers";
import { Role } from "@/generated/prisma/enums";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(Role.TEACHER, Role.ADMIN);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-8">
        {children}
      </main>
      <BottomTabBar role={Role.TEACHER} />
    </div>
  );
}
