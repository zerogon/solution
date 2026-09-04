"use client";

import { cn } from "@/lib/utils";
import { NavBadge } from "@/components/nav-badge";

export interface FilterChip {
  /** null = "전체". */
  value: string | null;
  label: string;
  /** 칩 아래 작게 붙는 보조 줄(지역 등). 없으면 한 줄 칩이 된다. */
  sub?: string | null;
  /** 예약 가능 건수 배지. `undefined`면 배지를 그리지 않는다(조회 전). */
  count?: number;
}

/**
 * 필터 칩 한 줄/한 그리드. 리조트·지역·지점 세 축이 같은 시각 언어를 쓰도록
 * `BranchTabs`의 칩 스타일을 여기로 뺐다.
 *
 * `layout="grid"`는 개수에 비의존적인 컬럼 수를 쓴다. 예전 `sm:grid-cols-5`는
 * "옵션이 정확히 5개"에 맞춘 값이라 지점 수가 바뀌는 순간 마지막 줄에 조각 칩이
 * 생긴다. auto-flow 그리드는 개수와 무관하게 채워진다.
 */
export function FilterChipRow({
  label,
  chips,
  value,
  onChange,
  layout = "grid",
}: {
  /** 축 제목. 칩 줄 위에 그려지고 그룹의 접근성 이름으로도 쓰인다. */
  label: string;
  chips: FilterChip[];
  value: string | null;
  onChange: (next: string | null) => void;
  layout?: "grid" | "wrap";
}) {
  return (
    // 축 하나를 옅은 상자로 묶는다. 상자 언어는 이 패널이 이미 쓰는 것이고
    // (캘린더 카드·박수 스테퍼가 `rounded-lg border bg-card`), 칩은 그 안에서
    // `bg-background`로 내려 앉아 상자 테두리와 칩 테두리가 같은 선으로 읽히지 않는다.
    <div className="space-y-1.5 rounded-lg border bg-card p-2">
      {/* 축 제목은 화면에도 보여야 한다. 예전에는 `aria-label`뿐이라 눈에 보이는 것은
          **제목 없는 칩 덩이 여럿**이었고, 리조트 줄과 지역 줄이 둘 다 `전체`로 시작해
          무엇의 전체인지 구분할 근거가 위치밖에 없었다.

          `aria-hidden`인 이유: 같은 문자열이 바로 아래 tablist의 `aria-label`로 이미
          읽힌다. 빼면 스크린리더가 그룹 이름을 두 번 부른다. */}
      <p
        aria-hidden
        className="px-0.5 text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </p>

      <div
        role="tablist"
        aria-label={label}
        className={cn(
          layout === "grid"
            ? "grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-2"
            : "flex flex-wrap gap-1.5",
        )}
      >
        {chips.map((chip) => {
          const selected = chip.value === value;
          return (
            <button
              key={chip.value ?? "__all__"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(chip.value)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-sm transition-colors",
                layout === "wrap" && "px-2.5 py-1.5",
                selected
                  ? "border-primary bg-primary/5 font-medium text-foreground ring-1 ring-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-1.5">
                {chip.label}
                {chip.count !== undefined && <NavBadge count={chip.count} />}
              </span>
              {chip.sub && (
                <span className="text-[11px] text-muted-foreground">{chip.sub}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
