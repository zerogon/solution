"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminSetTeacherSpecialties } from "@/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Specialty } from "@/generated/prisma/enums";
import { SPECIALTY_LABEL, SPECIALTY_ORDER, sortSpecialties } from "@/lib/specialty";

interface Props {
  teacherId: string;
  current: Specialty[];
}

export function SpecialtyEditor({ teacherId, current }: Props) {
  const [selected, setSelected] = useState<Specialty[]>(sortSpecialties(current));
  const [pending, startTransition] = useTransition();

  const sortedCurrent = sortSpecialties(current);
  const changed =
    selected.length !== sortedCurrent.length ||
    selected.some((s, i) => s !== sortedCurrent[i]);

  function toggle(s: Specialty) {
    setSelected((prev) =>
      prev.includes(s)
        ? prev.filter((x) => x !== s)
        : sortSpecialties([...prev, s]),
    );
  }

  function save() {
    if (!changed) return;
    startTransition(async () => {
      const res = await adminSetTeacherSpecialties({ teacherId, specialties: selected });
      if (res.ok) toast.success("전공이 변경되었습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SPECIALTY_ORDER.map((s) => {
          const active = selected.includes(s);
          return (
            <Badge
              key={s}
              role="button"
              aria-pressed={active}
              variant={active ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5 text-sm"
              onClick={() => toggle(s)}
            >
              {SPECIALTY_LABEL[s]}
            </Badge>
          );
        })}
      </div>
      <Button onClick={save} disabled={pending || !changed}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}
