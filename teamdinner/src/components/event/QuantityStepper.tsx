"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  qty: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
  /** 0일 때 보이는 버튼 라벨. */
  addLabel?: string;
  className?: string;
  max?: number;
}

/** 0이면 「담기」 한 버튼, 1 이상이면 −/수량/+ 스테퍼. */
export function QuantityStepper({ qty, onChange, disabled, addLabel = "담기", className, max = 99 }: Props) {
  if (qty <= 0) {
    return (
      <Button
        size="sm"
        className={cn("h-8 px-3", className)}
        disabled={disabled}
        onClick={() => onChange(1)}
        aria-label={addLabel}
      >
        <PlusIcon data-icon="inline-start" /> {addLabel}
      </Button>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex h-8 items-center rounded-lg bg-primary text-primary-foreground shadow-xs",
        className,
      )}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-8 rounded-r-none text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        disabled={disabled}
        onClick={() => onChange(qty - 1)}
        aria-label="하나 빼기"
      >
        <MinusIcon />
      </Button>
      <span className="min-w-6 text-center font-mono text-sm font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-8 rounded-l-none text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        disabled={disabled || qty >= max}
        onClick={() => onChange(qty + 1)}
        aria-label="하나 더"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
