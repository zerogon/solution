import { RoleNav } from "@/components/RoleNav";
import { requireRole } from "@/lib/auth-helpers";
import { Role } from "@/generated/prisma/enums";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(Role.STUDENT, Role.ADMIN);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
