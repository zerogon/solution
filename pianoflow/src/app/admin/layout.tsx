import { AppShell } from "@/components/app-shell/AppShell";
import { requireRole } from "@/lib/auth-helpers";
import { Role } from "@/generated/prisma/enums";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(Role.ADMIN);
  return (
    <AppShell role={Role.ADMIN} userName={session.user.name}>
      {children}
    </AppShell>
  );
}
