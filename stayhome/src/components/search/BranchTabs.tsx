"use client";

import { cn } from "@/lib/utils";
import { LOTTE } from "@/crawlers/lotte/config";
import { NavBadge } from "@/components/nav-badge";

/** 전체 지점을 뜻하는 값. `/api/inventory`에는 branch 파라미터를 생략해 보낸다. */
export const ALL_BRANCHES = "";

/**
 * 지점 선택 세그먼트.
 *
 * 드롭다운(`Select`)이었던 것을 항상 보이는 세그먼트로 바꿨다. 지점이 4개뿐이라
 * 펼치지 않아도 다 보이고, 조회 후에는 각 지점의 예약 가능 건수를 배지로 함께
 * 띄울 수 있다 — 드롭다운으로는 불가능했던 정보다.
 */
export function BranchTabs({
  value,
  counts,
  onChange,
}: {
  value: string;
  /** 지점(branchName) → 예약 가능 건수. 조회 전에는 비어 있다. */
  counts?: Record<string, number>;
  onChange: (next: string) => void;
}) {
  const options = [
    { value: ALL_BRANCHES, label: "전체", region: null as string | null },
    ...LOTTE.branches.map((b) => ({
      value: b.value,
      label: b.label,
      region: b.region,
    })),
  ];

  const totalAvailable = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div
      role="tablist"
      aria-label="지점"
      /* xl에서 3칸으로 되돌린다 — 320px 필터 패널에서 5칸이면 칩 하나가 조각이 된다. */
      className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 xl:grid-cols-3"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const count =
          opt.value === ALL_BRANCHES ? totalAvailable : (counts?.[opt.value] ?? 0);
        return (
          <button
            key={opt.value || "all"}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-sm transition-colors",
              selected
                ? "border-primary bg-primary/5 font-medium text-foreground ring-1 ring-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              {opt.label}
              {counts && <NavBadge count={count} />}
            </span>
            {opt.region && (
              <span className="text-[11px] text-muted-foreground">{opt.region}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
