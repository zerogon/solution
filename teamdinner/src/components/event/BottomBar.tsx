"use client";

import { ShoppingBasketIcon, UtensilsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CartSummary } from "@/lib/cart";
import { formatKrw } from "@/lib/price";

interface Props {
  summary: CartSummary;
  myQty: number;
  mySubtotal: number;
  tab: "menu" | "cart";
  onToggle: () => void;
}

/** 하단 고정 바 — 왼쪽은 나, 오른쪽은 전체. 누르면 메뉴/장바구니 탭을 오간다. */
export function BottomBar({ summary, myQty, mySubtotal, tab, onToggle }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
      <div className="pb-safe mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-x-3 gap-y-0 text-xs text-muted-foreground max-sm:flex-col">
          <span>
            나 <b className="font-mono text-sm text-foreground tabular-nums">{myQty}</b>개 ·{" "}
            <b className="font-mono text-sm text-foreground tabular-nums">{formatKrw(mySubtotal)}</b>
          </span>
          <span>
            전체 <b className="font-mono text-sm text-foreground tabular-nums">{summary.memberCount}</b>명 ·{" "}
            <b className="font-mono text-sm text-foreground tabular-nums">{formatKrw(summary.total)}</b>
            {summary.hasUnpriced && "+"}
          </span>
        </div>
        <Button size="lg" className="h-10 shrink-0 px-4" onClick={onToggle}>
          {tab === "menu" ? (
            <>
              <ShoppingBasketIcon data-icon="inline-start" /> 장바구니
              {summary.totalQty > 0 && (
                <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 font-mono text-xs tabular-nums">
                  {summary.totalQty}
                </span>
              )}
            </>
          ) : (
            <>
              <UtensilsIcon data-icon="inline-start" /> 메뉴 보기
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
