import { resolveYearParam } from "@/lib/calendar";
import { todayKstIso } from "@/lib/utils";
import { EntryFormPage } from "@/components/leave/EntryFormPage";

export const dynamic = "force-dynamic";

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  return <EntryFormPage year={resolveYearParam(year, todayKstIso())} />;
}
