"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EventDeleteDialog } from "@/components/event/EventDeleteDialog";
import { EventEditDialog } from "@/components/event/EventEditDialog";
import { CreateEventDialog } from "@/components/home/CreateEventDialog";
import { EventCard } from "@/components/home/EventCard";
import { api } from "@/lib/client-api";
import { isPast } from "@/lib/dates";
import type { EventSummary } from "@/lib/events";

interface Props {
  initial: EventSummary[];
  /** 서버가 렌더한 KST 오늘 — 서버/클라이언트가 같은 값을 써야 hydration이 맞는다. */
  today: string;
}

/** 팀 전체 회식 히스토리. 예정은 가까운 날짜부터, 지난 것은 최근 것부터. */
export function EventHistory({ initial, today }: Props) {
  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
    initialData: initial,
    refetchOnWindowFocus: true,
  });

  const [editing, setEditing] = useState<EventSummary | null>(null);
  const [deleting, setDeleting] = useState<EventSummary | null>(null);

  const { upcoming, past } = useMemo(() => {
    const upcoming = data.filter((e) => !isPast(e.eventDate, today)).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const past = data.filter((e) => isPast(e.eventDate, today)); // 이미 날짜 내림차순
    return { upcoming, past };
  }, [data, today]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">아직 만든 회식이 없습니다.</p>
        <CreateEventDialog defaultDate={today} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="예정된 회식"
        count={upcoming.length}
        empty={
          <div className="flex flex-col items-center gap-3">
            <p>예정된 회식이 없습니다.</p>
            <CreateEventDialog defaultDate={today} variant="outline" />
          </div>
        }
      >
        {upcoming.map((e) => (
          <EventCard key={e.slug} event={e} today={today} past={false} onEdit={setEditing} onDelete={setDeleting} />
        ))}
      </Section>
      {past.length > 0 && (
        <Section title="지난 회식" count={past.length}>
          {past.map((e) => (
            <EventCard key={e.slug} event={e} today={today} past onEdit={setEditing} onDelete={setDeleting} />
          ))}
        </Section>
      )}

      <EventEditDialog event={editing} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
      <EventDeleteDialog event={deleting} open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-1.5 text-sm font-semibold">
        {title} <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {count === 0 ? (
        <div className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}
