"use client";

import { useSyncExternalStore } from "react";

import {
  getMemberName,
  getRecentEventsSnapshot,
  subscribeMember,
  type RecentEvent,
} from "@/lib/member";

const EMPTY: RecentEvent[] = [];

/** undefined = 서버/hydration 전, null = 이름 없음, string = 이름. */
export function useMemberName(): string | null | undefined {
  return useSyncExternalStore(subscribeMember, getMemberName, () => undefined);
}

export function useRecentEvents(): RecentEvent[] {
  return useSyncExternalStore(subscribeMember, getRecentEventsSnapshot, () => EMPTY);
}
