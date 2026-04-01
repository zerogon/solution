"use client";

import { CalendarCheck, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScheduleList } from "@/components/ScheduleList";
import { UserSchedule } from "@/types/agenda";

interface ScheduleButtonProps {
  count: number;
  schedule: UserSchedule;
  onRemove: (time: string) => void;
}

export function ScheduleButton({
  count,
  schedule,
  onRemove,
}: ScheduleButtonProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto px-4 pb-4 pointer-events-auto">
        <Sheet>
          <SheetTrigger
            render={
              <Button
                size="lg"
                className="w-full rounded-full shadow-lg gap-2 h-12"
              />
            }
          >
            <CalendarCheck className="size-4" />
            <span>My Schedule</span>
            {count > 0 && (
              <span className="ml-1 bg-primary-foreground text-primary text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {count}
              </span>
            )}
            <ChevronUp className="size-3.5 ml-auto opacity-60" />
          </SheetTrigger>

          <SheetContent
            side="bottom"
            className="max-h-[70vh] rounded-t-2xl"
          >
            <SheetHeader>
              <SheetTitle>My Schedule</SheetTitle>
              <SheetDescription>
                {count > 0
                  ? `${count}개 세션이 선택되었습니다`
                  : "아직 선택한 세션이 없습니다"}
              </SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto flex-1 px-4 pb-4 scrollbar-thin">
              <ScheduleList schedule={schedule} onRemove={onRemove} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
