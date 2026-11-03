"use client";

import { ShoppingBasketIcon } from "lucide-react";

import { QuantityStepper } from "@/components/event/QuantityStepper";
import { Badge } from "@/components/ui/badge";
import type { CartSummary as Summary } from "@/lib/cart";
import { formatKrw } from "@/lib/price";
import { cn } from "@/lib/utils";

interface Props {
  summary: Summary;
  memberName: string | null;
  mine: Map<number, number>;
  onChange: (menuId: number, qty: number) => void;
  disabled?: boolean;
}

export function CartSummary({ summary, memberName, mine, onChange, disabled }: Props) {
  if (summary.byMenu.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
        <ShoppingBasketIcon className="size-9 opacity-50" />
        <p className="text-sm">아직 아무도 담지 않았습니다.</p>
        <p className="text-xs">메뉴 탭에서 먹고 싶은 것을 담아 보세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">메뉴별 집계</h2>
        <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {summary.byMenu.map((a) => {
            const myQty = mine.get(a.menu.id) ?? 0;
            return (
              <li key={a.menu.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.menu.name}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {formatKrw(a.menu.price)} × {a.totalQty}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {a.subtotal != null ? formatKrw(a.subtotal) : "가격 미정"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {a.members.map((m) => (
                    <Badge
                      key={m.name}
                      variant={m.name === memberName ? "default" : "secondary"}
                      className="h-5 px-1.5 text-[11px]"
                    >
                      {m.name}
                      {m.qty > 1 && <span className="font-mono tabular-nums"> ×{m.qty}</span>}
                    </Badge>
                  ))}
                  {memberName && (
                    <QuantityStepper
                      qty={myQty}
                      onChange={(q) => onChange(a.menu.id, q)}
                      disabled={disabled}
                      addLabel="나도"
                      className="ml-auto h-7"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">사람별</h2>
        <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {summary.byMember.map((m) => (
            <li key={m.name} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className={cn("font-medium", m.name === memberName && "text-primary")}>
                  {m.name}
                  {m.name === memberName && <span className="ml-1 text-xs font-normal text-muted-foreground">(나)</span>}
                </p>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatKrw(m.subtotal)}
                  {m.hasUnpriced && <span className="text-xs font-normal text-muted-foreground"> +미정</span>}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.items.map((it) => `${it.menu.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-accent px-4 py-3 text-accent-foreground">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">예상 합계</span>
          <span className="font-mono text-lg font-bold tabular-nums">{formatKrw(summary.total)}</span>
        </div>
        <p className="mt-0.5 text-xs opacity-80">
          {summary.memberCount}명 · {summary.totalQty}개
          {summary.hasUnpriced && " · 가격 미정 메뉴는 합계에서 빠져 있습니다"}
        </p>
      </section>
    </div>
  );
}
