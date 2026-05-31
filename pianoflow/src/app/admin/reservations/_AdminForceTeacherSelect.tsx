"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
} from "@/components/ui/combobox";

type StudentOption = { id: string; name: string; remaining: number };

export function AdminForceTeacherSelect({
  students,
  currentStudentId,
  dateStr,
  teacherId,
}: {
  students: StudentOption[];
  currentStudentId?: string;
  dateStr: string;
  teacherId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const studentById = useMemo(() => {
    const map = new Map<string, StudentOption>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">학생:</span>
      <Combobox
        items={ids}
        value={currentStudentId ?? null}
        autoHighlight
        itemToStringLabel={(id) => studentById.get(id)?.name ?? ""}
        onValueChange={(id) => {
          if (!id) return;
          const next = new URLSearchParams(params?.toString() ?? "");
          next.set("student", id);
          next.set("date", dateStr);
          if (teacherId) next.set("teacher", teacherId);
          startTransition(() => router.push(`${pathname}?${next.toString()}`));
        }}
      >
        <ComboboxInput placeholder="학생 검색" className="w-[220px]" />
        <ComboboxContent emptyText="학생 없음">
          {(id: string) => {
            const s = studentById.get(id);
            return (
              <ComboboxItem key={id} value={id}>
                {s?.name} (남은 {s?.remaining ?? 0}회)
              </ComboboxItem>
            );
          }}
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
