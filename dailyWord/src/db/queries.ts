import { getDb } from "./index";
import { visits, zodiacFortunes, dailySentences, pageViews, ideas } from "./schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";

export async function recordVisit(sessionId: string, userAgent: string | null) {
  await getDb().insert(visits).values({ sessionId, userAgent });
}

export async function getZodiacFortune(zodiacKey: string, dayOfYear: number) {
  const result = await getDb()
    .select({
      overall: zodiacFortunes.overall,
      love: zodiacFortunes.love,
      money: zodiacFortunes.money,
      health: zodiacFortunes.health,
      overallScore: zodiacFortunes.overallScore,
      loveScore: zodiacFortunes.loveScore,
      moneyScore: zodiacFortunes.moneyScore,
      healthScore: zodiacFortunes.healthScore,
    })
    .from(zodiacFortunes)
    .where(
      and(
        eq(zodiacFortunes.zodiacKey, zodiacKey),
        eq(zodiacFortunes.dayOfYear, dayOfYear)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function getActiveSentences() {
  return getDb()
    .select({ id: dailySentences.id, text: dailySentences.text })
    .from(dailySentences)
    .where(eq(dailySentences.isActive, true))
    .orderBy(dailySentences.id);
}

export async function recordPageView(
  sessionId: string,
  page: string,
  deviceId: string | null
) {
  await getDb().insert(pageViews).values({ sessionId, page, deviceId });
}

export async function submitIdea(name: string | null, content: string) {
  await getDb().insert(ideas).values({ name, content });
}

export async function getIdeas() {
  return getDb()
    .select({
      id: ideas.id,
      name: ideas.name,
      content: ideas.content,
      createdAt: ideas.createdAt,
    })
    .from(ideas)
    .orderBy(desc(ideas.createdAt));
}

function getTodayStartKST(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().slice(0, 10);
  return new Date(dateStr + "T00:00:00+09:00");
}

export async function getTodayStats() {
  const todayStart = getTodayStartKST();

  const result = await getDb()
    .select({
      total: sql<number>`count(distinct coalesce(${pageViews.deviceId}, ${pageViews.sessionId}))`,
      dailySentence: sql<number>`count(distinct case when ${pageViews.page} = 'daily_sentence' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
      zodiacFortune: sql<number>`count(distinct case when ${pageViews.page} = 'zodiac_fortune' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
    })
    .from(pageViews)
    .where(gte(pageViews.viewedAt, todayStart));

  return result[0] ?? { total: 0, dailySentence: 0, zodiacFortune: 0 };
}

export async function getDailyStats(days: number = 30) {
  const result = await getDb()
    .select({
      date: sql<string>`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
      total: sql<number>`count(distinct coalesce(${pageViews.deviceId}, ${pageViews.sessionId}))`,
      dailySentence: sql<number>`count(distinct case when ${pageViews.page} = 'daily_sentence' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
      zodiacFortune: sql<number>`count(distinct case when ${pageViews.page} = 'zodiac_fortune' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
    })
    .from(pageViews)
    .where(
      gte(
        pageViews.viewedAt,
        sql`now() AT TIME ZONE 'Asia/Seoul' - interval '${sql.raw(String(days))} days'`
      )
    )
    .groupBy(
      sql`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`
    )
    .orderBy(
      sql`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`
    );

  return result;
}

export async function getMonthlyStats(months: number = 12) {
  const result = await getDb()
    .select({
      month: sql<string>`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`,
      total: sql<number>`count(distinct coalesce(${pageViews.deviceId}, ${pageViews.sessionId}))`,
      dailySentence: sql<number>`count(distinct case when ${pageViews.page} = 'daily_sentence' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
      zodiacFortune: sql<number>`count(distinct case when ${pageViews.page} = 'zodiac_fortune' then coalesce(${pageViews.deviceId}, ${pageViews.sessionId}) end)`,
    })
    .from(pageViews)
    .where(
      gte(
        pageViews.viewedAt,
        sql`now() AT TIME ZONE 'Asia/Seoul' - interval '${sql.raw(String(months))} months'`
      )
    )
    .groupBy(
      sql`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`
    )
    .orderBy(
      sql`to_char(${pageViews.viewedAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`
    );

  return result;
}
