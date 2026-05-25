"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminForceTeacherSelect({
  students,
  currentStudentId,
  dateStr,
  teacherId,
}: {
  students: { id: string; name: string; remaining: number }[];
  currentStudentId?: string;
  dateStr: string;
  teacherId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">학생:</span>
      <Select
        value={currentStudentId}
        onValueChange={(v) => {
          if (!v) return;
          const next = new URLSearchParams(params?.toString() ?? "");
          next.set("student", v);
          next.set("date", dateStr);
          if (teacherId) next.set("teacher", teacherId);
          startTransition(() => router.push(`${pathname}?${next.toString()}`));
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="학생 선택" />
        </SelectTrigger>
        <SelectContent>
          {students.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name} (남은 {s.remaining}회)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
