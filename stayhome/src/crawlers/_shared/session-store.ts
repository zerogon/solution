import type { BrowserContext } from "playwright-core";
import { prisma } from "@/lib/prisma";

/**
 * Playwright `storageState()` result type — loose `unknown` so we don't depend
 * on playwright's internal types from places that just pass it through to DB.
 */
export type StorageStateJSON = unknown;

export async function loadStorageState(
  resortId: string,
): Promise<{ storageState: StorageStateJSON; expired: boolean } | null> {
  const row = await prisma.resortSession.findUnique({
    where: { resortId },
  });
  if (!row) return null;
  return {
    storageState: row.storageState,
    expired: row.expiresAt.getTime() <= Date.now(),
  };
}

export async function saveStorageState(
  resortId: string,
  context: BrowserContext,
  ttlMs: number,
) {
  const state = await context.storageState();
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.resortSession.upsert({
    where: { resortId },
    create: {
      resortId,
      storageState: state as never,
      expiresAt,
    },
    update: {
      storageState: state as never,
      expiresAt,
    },
  });
}

export async function clearStorageState(resortId: string) {
  await prisma.resortSession
    .delete({ where: { resortId } })
    .catch(() => undefined);
}
