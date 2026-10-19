import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/utils";
import { EntryFormPage } from "@/components/leave/EntryFormPage";

export const dynamic = "force-dynamic";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = /^[0-9a-f-]{36}$/.test(id) ? await prisma.leaveEntry.findUnique({ where: { id } }) : null;
  if (!entry) notFound();

  const startIso = toIsoDate(entry.startDate);
  return (
    <EntryFormPage
      year={Number(startIso.slice(0, 4))}
      initial={{
        id: entry.id,
        type: entry.type,
        startIso,
        endIso: toIsoDate(entry.endDate),
        days: entry.days,
        manualDays: entry.manualDays,
        memo: entry.memo,
      }}
    />
  );
}
