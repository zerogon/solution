"use client";

import { UtensilsCrossedIcon } from "lucide-react";
import Image from "next/image";

import { QuantityStepper } from "@/components/event/QuantityStepper";
import { Badge } from "@/components/ui/badge";
import type { MenuDto } from "@/lib/events";
import { formatKrw } from "@/lib/price";
import { cn } from "@/lib/utils";

interface Props {
  menu: MenuDto;
  myQty: number;
  /** 나를 포함한 전체 수량. */
  totalQty: number;
  /** 이 메뉴를 담은 사람 수. */
  memberCount: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}

export function MenuCard({ menu, myQty, totalQty, memberCount, onChange, disabled }: Props) {
  const othersQty = totalQty - myQty;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow",
        myQty > 0 && "ring-primary/40",
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {menu.imageUrl ? (
          <Image src={menu.imageUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/60">
            <UtensilsCrossedIcon className="size-7" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-medium">{menu.name}</h3>
        </div>
        {menu.description && (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{menu.description}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-sm font-semibold tabular-nums">{formatKrw(menu.price)}</span>
            <div className="flex flex-wrap gap-1">
              {menu.source === "custom" && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  직접 추가{menu.addedBy ? ` · ${menu.addedBy}` : ""}
                </Badge>
              )}
              {totalQty > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 font-mono text-[11px] tabular-nums">
                  {memberCount}명 · {totalQty}개{othersQty > 0 && myQty > 0 ? ` (나 ${myQty})` : ""}
                </Badge>
              )}
            </div>
          </div>
          <QuantityStepper qty={myQty} onChange={onChange} disabled={disabled} />
        </div>
      </div>
    </li>
  );
}
