"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Calendar } from "@/components/ui/calendar";
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
  const minDate = parseKstDate(formatKstDate(today));
  const maxDate = new Date(minDate.getTime() + 60 * 24 * 60 * 60 * 1000);

  return (
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
      className={pending ? "pointer-events-none opacity-60" : undefined}
    />
  );
}
