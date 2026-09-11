"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  TONE_BADGE,
  TONE_DOT,
  TONE_LABEL,
  TONE_SURFACE,
  toneOf,
  type AvailabilityTone,
} from "@/lib/availability-tone";
import { checkedLabel } from "@/lib/freshness";
import type { InventoryVariant } from "@/lib/variants";

/**
 * 객실 행의 **겉껍질** — `<li>`와 세부 목록의 펼침 상태를 소유한다. 줄 안의 내용(점·객실명·
 * 정원·요금·수동 요금 버튼·배지·링크)은 `BranchResultSection`이 그대로 그려서 `children`으로
 * 넘긴다. 그쪽은 `"use client"`가 없는 순수 렌더 컴포넌트이고, 한 행을 여닫는 일이 지점의
 * 모든 행을 다시 그리게 하지 않기 위해 상태는 행에 가둔다(`RoomRateCell`과 같은 판단).
 *
 * 세부 목록은 **행의 분해**다(`@/lib/variants`). 소노는 뷰 변형(스탠다드/파크뷰 …)을 한 행에
 * 접어 두고 있어서, 행의 배지가 "예약 가능"이라 해도 어느 변형이 되는지는 여기서만 보인다.
 * 그래서 이 목록은 행의 판정을 바꾸지 않고 풀어 보여줄 뿐이며, 요약 스탯·필터 칩·수동 요금은
 * 이 목록을 모른다.
 *
 * - **펼침 버튼은 변형이 둘 이상일 때만.** 하나면 목록이 행을 되풀이할 뿐이다.
 * - **변형의 색은 행의 `syncedAt`으로 판정한다.** 같은 문장으로 쓰였으니 나이가 같고,
 *   낡은 행 아래에 초록 "예약 가능" 칩이 서는 것은 `freshness.ts`가 막으려는 바로 그 모순이다.
 * - **어휘는 `TONE_*` 재사용.** 사이트의 "원활"은 우리의 "예약 가능"이다 — 분해가 행과
 *   다른 말을 쓰면 사용자는 두 어휘를 맞춰 읽어야 한다.
 * - 기본 접힘. 상태는 로컬이라 재조회(새 `id`)에서 초기화된다.
 */
export function RoomRow({
  tone,
  roomType,
  variants,
  syncedAt,
  now,
  children,
}: {
  tone: AvailabilityTone;
  roomType: string;
  variants: InventoryVariant[] | null;
  syncedAt: string;
  /** 신선도 기준 시각. 행과 같은 값을 받아야 행과 변형이 같은 등급을 받는다. */
  now: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const expandable = (variants?.length ?? 0) >= 2;

  return (
    <li className={cn("rounded-lg border", TONE_SURFACE[tone])}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {children}
        {expandable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="-mr-1 shrink-0 text-muted-foreground"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${roomType} 세부 객실 ${variants!.length}종 ${open ? "접기" : "보기"}`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>
      {expandable && open && (
        <ul
          id={panelId}
          className="grid gap-1 border-t border-black/5 py-1.5 pr-3 pl-8"
          aria-label={`${roomType} 세부 객실`}
        >
          {variants!.map((v) => {
            const vt = toneOf({ available: v.available, closingSoon: v.closingSoon, syncedAt }, now);
            return (
              <li key={v.code} className="flex items-center gap-2 text-xs">
                <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[vt])} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{v.label}</span>
                {/* 잔여는 `available`일 때만 온다(`InventoryVariant.remaining`) — 매진의 0과
                    대기의 음수는 수가 아니라 상태다. 그 자리는 칩이 말한다. */}
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {v.remaining != null ? `${v.remaining}실` : "—"}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium",
                    TONE_BADGE[vt],
                  )}
                >
                  {vt === "unverified" ? checkedLabel(syncedAt, now) : TONE_LABEL[vt]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
