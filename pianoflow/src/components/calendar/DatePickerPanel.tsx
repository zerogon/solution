"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatKstDate, parseKstDate } from "@/lib/slots";

interface Props {
  selectedDateStr: string;
  paramName?: string;
}

export function DatePickerPanel({ selectedDateStr, paramName = "date" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selected = parseKstDate(selectedDateStr);

  const today = new Date();
  const todayStart = parseKstDate(formatKstDate(today));
  // 당일 예약 불가 → 내일부터 선택 가능
  const minDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const maxDate = new Date(todayStart.getTime() + 60 * 24 * 60 * 60 * 1000);

  return (
    <div className="mx-auto w-fit">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(date) => {
          if (!date) return;
          const next = new URLSearchParams(params.toString());
          next.set(paramName, formatKstDate(date));
          startTransition(() => {
            router.push(`${pathname}?${next.toString()}`);
          });
        }}
        disabled={{ before: minDate, after: maxDate }}
        className={cn(
          "transition-opacity duration-200",
          pending && "pointer-events-none opacity-50",
        )}
      />
    </div>
  );
}
