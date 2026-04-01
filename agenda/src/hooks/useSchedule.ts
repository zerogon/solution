"use client";

import { useState, useEffect, useCallback } from "react";
import { UserSchedule } from "@/types/agenda";
import { sessions } from "@/data/sessions";

const STORAGE_KEY = "databricks-schedule";

export function useSchedule() {
  const [schedule, setSchedule] = useState<UserSchedule>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSchedule(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
    }
  }, [schedule, isLoaded]);

  const toggleSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.isBreak) return;

    setSchedule((prev) => {
      const current = prev[session.time];
      if (current === sessionId) {
        const next = { ...prev };
        delete next[session.time];
        return next;
      }
      return { ...prev, [session.time]: sessionId };
    });
  }, []);

  const removeSession = useCallback((time: string) => {
    setSchedule((prev) => {
      const next = { ...prev };
      delete next[time];
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return false;
      return schedule[session.time] === sessionId;
    },
    [schedule]
  );

  const selectedCount = Object.keys(schedule).length;

  return {
    schedule,
    isLoaded,
    toggleSession,
    removeSession,
    isSelected,
    selectedCount,
  };
}
