import { prisma } from "@/lib/prisma";
import { AccountTable } from "@/components/admin/AccountTable";
import { AccountFormDialog } from "@/components/admin/AccountFormDialog";

export default async function AdminAccountsPage() {
  const [resorts, accounts] = await Promise.all([
    prisma.resort.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, active: true },
    }),
    prisma.resortAccount.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { resort: { select: { name: true, slug: true } } },
    }),
  ]);

  const safeAccounts = accounts.map((a) => ({
    id: a.id,
    resortId: a.resortId,
    resortName: a.resort.name,
    resortSlug: a.resort.slug,
    label: a.label,
    memo: a.memo,
    isPrimary: a.isPrimary,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">리조트 계정 관리</h1>
          <p className="text-sm text-muted-foreground">
            계정 정보는 AES-256-GCM으로 암호화되어 저장되며, 기본 마스킹 상태로 표시됩니다.
          </p>
        </div>
        <AccountFormDialog mode="create" resorts={resorts} />
      </div>
      <AccountTable accounts={safeAccounts} resorts={resorts} />
    </div>
  );
}
