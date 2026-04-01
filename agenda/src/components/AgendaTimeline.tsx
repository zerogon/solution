"use client";

import { Clock } from "lucide-react";
import { TimeSlot } from "@/types/agenda";
import { AgendaCard } from "@/components/AgendaCard";
import { formatTime } from "@/data/sessions";
import { cn } from "@/lib/utils";

interface AgendaTimelineProps {
  timeSlots: TimeSlot[];
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
}

export function AgendaTimeline({
  timeSlots,
  isSelected,
  onToggle,
}: AgendaTimelineProps) {
  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[19px] top-8 bottom-4 w-px bg-border" />

      <div className="space-y-1">
        {timeSlots.map((slot) => {
          const isBreak =
            slot.sessions.length === 1 && slot.sessions[0].isBreak;
          const hasSelection =
            !isBreak && slot.sessions.some((s) => isSelected(s.id));

          return (
            <section key={slot.time} className="relative">
              {/* Time header with dot on timeline */}
              <div className="sticky top-[53px] z-10 bg-background/95 backdrop-blur-sm py-2.5 mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 bg-background transition-colors",
                      hasSelection
                        ? "border-primary"
                        : "border-muted-foreground/30"
                    )}
                  >
                    <Clock
                      className={cn(
                        "size-4 transition-colors",
                        hasSelection
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tabular-nums">
                      {formatTime(slot.time)}
                    </h2>
                    {!isBreak && (
                      <p className="text-[10px] text-muted-foreground">
                        {hasSelection ? "선택 완료" : "세션을 선택해주세요"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Cards area */}
              <div className="pl-[52px] pb-6">
                {isBreak ? (
                  <AgendaCard
                    session={slot.sessions[0]}
                    selected={false}
                    onToggle={onToggle}
                  />
                ) : (
                  <div
                    className="grid gap-2.5"
                    role="radiogroup"
                    aria-label={`${formatTime(slot.time)} 세션 선택`}
                  >
                    {slot.sessions.map((session) => (
                      <AgendaCard
                        key={session.id}
                        session={session}
                        selected={isSelected(session.id)}
                        onToggle={onToggle}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
