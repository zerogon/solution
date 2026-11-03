"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRecentEvents } from "@/lib/use-member";

/** 이 브라우저에서 열어 본 회식 목록 (localStorage). 서버는 모른다. */
export function RecentEvents() {
  const items = useRecentEvents();
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">최근 참여한 회식</h2>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {items.map((e) => (
          <li key={e.slug}>
            <Link
              href={`/e/${e.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{e.placeName}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
