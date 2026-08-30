"use client";

import { cn } from "@/lib/utils";

export interface FilterChip {
  /** null = "전체". */
  value: string | null;
  label: string;
  /** 예약 가능 건수. `undefined`면 그리지 않는다(조회 전). */
  count?: number;
}

/**
 * 필터의 건수 표기.
 *
 * **`NavBadge`를 쓰지 않는다.** 그쪽 정책은 "0이면 숨김 · 10 이상은 `9+`"인데,
 * 내비게이션에서는 옳고 필터에서는 정확히 반대다:
 * - 0이 사라지면 "여긴 없다"와 "이 축을 아직 안 세어봤다"가 같은 빈칸이 되고,
 *   사용자는 그걸 **선택 불가**로 읽는다(실제로는 눌러서 0건을 확인할 수 있다).
 * - 32와 12가 똑같은 `9+`가 되면 지역 칩 열두 개가 전부 같은 숫자를 단다.
 *
 * `NavBadge`는 손대지 않는다 — 정책이 다른 두 자리에 하나를 억지로 맞추면 둘 다 흐려진다.
 */
export function FilterCount({ count }: { count?: number }) {
  if (count === undefined) return null;
  return (
    <span
      className={cn(
        "font-mono text-[11px] tabular-nums",
        count === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

/**
 * 필터 칩 한 줄. 장소 팝업의 지역·리조트 두 축이 쓴다.
 *
 * ## 축 제목이 화면에 보인다
 * 예전에는 `label`이 `aria-label`뿐이라, 눈에 보이는 것은 **제목 없는 칩 두 덩이**였고
 * 둘 다 맨 앞이 `전체`라 무엇의 전체인지 구분할 근거가 위치밖에 없었다.
 *
 * ## 레이아웃이 하나뿐이다
 * 종전에는 `layout="grid" | "wrap"` 두 문법이 있었고 축마다 다른 쪽을 썼다(리조트=격자,
 * 지역=wrap). 같은 개념 층위의 축이 서로 다르게 생긴 것이 "난잡하다"의 실제 내용 중
 * 하나였다. 남기는 것은 wrap 하나.
 *
 * ## `tablist`가 아니라 `group`
 * 종전 `role="tablist"`/`role="tab"`은 tabpanel이 없어 스크린리더에 거짓말이었고,
 * 다이얼로그 안으로 들어오면 roving tabindex 기대까지 얹힌다. 여기서 필요한 의미는
 * "누를 수 있고 눌린 상태를 갖는 버튼들"이라 `aria-pressed`가 맞다.
 */
export function FilterChipRow({
  label,
  chips,
  value,
  onChange,
}: {
  /** 화면에 보이는 축 제목이자 그룹의 접근성 이름. */
  label: string;
  chips: FilterChip[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-10 shrink-0 pt-1.5 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="flex min-w-0 flex-wrap gap-1.5"
      >
        {chips.map((chip) => {
          const selected = chip.value === value;
          return (
            <button
              key={chip.value ?? "__all__"}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(chip.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                selected
                  ? "border-primary bg-primary/5 font-medium text-foreground ring-1 ring-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                // 0건은 흐리게 하되 **비활성화하지 않는다** — 눌러서 0건을 확인하는 것이
                // 정당한 사용이고, 막으면 "왜 안 눌리지"가 된다.
                chip.count === 0 && !selected && "opacity-60",
              )}
            >
              {chip.label}
              <FilterCount count={chip.count} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
