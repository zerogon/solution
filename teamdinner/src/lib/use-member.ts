"use client";

import { useSyncExternalStore } from "react";

import { getMemberNameSnapshot, subscribeMember } from "@/lib/member";

/** undefined = 서버/hydration 전, null = 이름 없음, string = 이름. */
export function useMemberName(): string | null | undefined {
  return useSyncExternalStore(subscribeMember, getMemberNameSnapshot, () => undefined);
}
