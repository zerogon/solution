import { Badge } from "@/components/ui/badge";
import { Specialty } from "@/generated/prisma/enums";
import { SPECIALTY_LABEL, sortSpecialties } from "@/lib/specialty";

/** 선생님 전공(클래식/재즈/반주)을 뱃지 묶음으로 표시. 비어있으면 "미설정" 안내. */
export function SpecialtyBadges({
  specialties,
  emptyText = "미설정",
}: {
  specialties: Specialty[];
  emptyText?: string;
}) {
  const sorted = sortSpecialties(specialties);
  if (sorted.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((s) => (
        <Badge key={s} variant="secondary">
          {SPECIALTY_LABEL[s]}
        </Badge>
      ))}
    </div>
  );
}
