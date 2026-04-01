import { getDb } from "./index";
import { words, fortunes, visits, selections } from "./schema";
import { eq, sql, and, gte, asc, desc } from "drizzle-orm";

function todayKST(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

export async function getActiveWords() {
  return getDb()
    .select({ id: words.id, word: words.word, displayOrder: words.displayOrder })
    .from(words)
    .where(eq(words.isActive, true))
    .orderBy(asc(words.displayOrder));
}

export async function getSessionSelection(sessionId: string) {
  const today = todayKST();
  const result = await getDb()
    .select({
      wordId: selections.wordId,
      word: words.word,
      fortune: fortunes.fortune,
    })
    .from(selections)
    .innerJoin(words, eq(selections.wordId, words.id))
    .innerJoin(fortunes, eq(fortunes.wordId, words.id))
    .where(
      and(eq(selections.sessionId, sessionId), gte(selections.selectedAt, today))
    )
    .limit(1);

  return result[0] ?? null;
}

export async function recordVisit(sessionId: string, userAgent: string | null) {
  await getDb().insert(visits).values({ sessionId, userAgent });
}

export async function recordSelection(sessionId: string, wordId: number) {
  const today = todayKST();

  // 중복 체크
  const existing = await getDb()
    .select({ id: selections.id })
    .from(selections)
    .where(
      and(eq(selections.sessionId, sessionId), gte(selections.selectedAt, today))
    )
    .limit(1);

  if (existing.length > 0) {
    return null;
  }

  await getDb().insert(selections).values({ sessionId, wordId });

  const word = await getDb()
    .select({ word: words.word })
    .from(words)
    .where(eq(words.id, wordId))
    .limit(1);

  // 랜덤 운세 선택
  const forts = await getDb()
    .select({ fortune: fortunes.fortune })
    .from(fortunes)
    .where(eq(fortunes.wordId, wordId));

  if (word.length === 0) return null;

  const randomFortune = forts[Math.floor(Math.random() * forts.length)];
  return {
    word: word[0].word,
    fortune: randomFortune?.fortune ?? null,
  };
}

export async function deleteSessionSelection(sessionId: string) {
  const today = todayKST();
  await getDb()
    .delete(selections)
    .where(
      and(eq(selections.sessionId, sessionId), gte(selections.selectedAt, today))
    );
}

export async function getTodayStats() {
  const today = todayKST();

  const result = await getDb()
    .select({
      wordId: selections.wordId,
      word: words.word,
      count: sql<number>`count(*)::int`,
    })
    .from(selections)
    .innerJoin(words, eq(selections.wordId, words.id))
    .where(gte(selections.selectedAt, today))
    .groupBy(selections.wordId, words.word)
    .orderBy(desc(sql`count(*)`))
    .limit(3);

  const totalResult = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(selections)
    .where(gte(selections.selectedAt, today));

  const total = totalResult[0]?.total ?? 0;

  return {
    stats: result.map((r) => ({
      word: r.word,
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
    })),
    totalSelections: total,
  };
}
