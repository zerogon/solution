"use client";

import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleList } from "@/components/ScheduleList";
import { useSchedule } from "@/hooks/useSchedule";

export default function SchedulePage() {
  const { schedule, isLoaded, removeSession, selectedCount } = useSchedule();

  if (!isLoaded) {
    return (
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => window.history.back()}>
          <ArrowLeft className="size-4" />
          돌아가기
        </Button>
        <span className="text-sm text-muted-foreground">
          {selectedCount}개 세션 선택됨
        </span>
      </div>

      <h2 className="text-lg font-bold mb-4">My Schedule</h2>
      <ScheduleList schedule={schedule} onRemove={removeSession} />

      {selectedCount > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Camera className="size-3.5" />
          <span>스크린샷으로 저장하세요</span>
        </div>
      )}
    </main>
  );
}
