"use client";

import { Sparkles } from "lucide-react";
import { AgendaTimeline } from "@/components/AgendaTimeline";
import { ScheduleButton } from "@/components/ScheduleButton";
import { useSchedule } from "@/hooks/useSchedule";
import { getTimeSlots } from "@/data/sessions";

const timeSlots = getTimeSlots();

export default function HomePage() {
  const { schedule, isLoaded, isSelected, toggleSession, removeSession, selectedCount } =
    useSchedule();

  if (!isLoaded) {
    return (
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="animate-pulse space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 bg-muted rounded w-24" />
              <div className="h-24 bg-muted rounded" />
              <div className="h-24 bg-muted rounded" />
              <div className="h-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-28">
      {selectedCount === 0 && (
        <section className="mb-8 rounded-xl bg-muted/50 p-5 border border-border">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2 flex-shrink-0">
              <Sparkles className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-bold mb-1">
                나만의 일정을 만들어보세요
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                시간대별로 관심 있는 세션을 탭하면 자동으로 스케줄이 구성됩니다.
                같은 시간에는 하나의 세션만 선택할 수 있어요.
              </p>
            </div>
          </div>
        </section>
      )}

      <AgendaTimeline
        timeSlots={timeSlots}
        isSelected={isSelected}
        onToggle={toggleSession}
      />
      <ScheduleButton
        count={selectedCount}
        schedule={schedule}
        onRemove={removeSession}
      />
    </main>
  );
}
