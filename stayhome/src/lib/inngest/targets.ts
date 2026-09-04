import { prisma } from "@/lib/prisma";
import { isCrawlerRegistered } from "@/crawlers/registry";
import type { ResortSlug } from "@/generated/prisma/enums";

/**
 * Resorts a scheduled pass should crawl: flagged `active` in the DB *and*
 * backed by a registered crawler module.
 *
 * Both conditions matter and mean different things — `active` is the operator's
 * switch (credentials verified, site behaving), while registration is whether
 * the code exists at all. Through Phase F the two drift apart constantly, and
 * fanning out to an unregistered slug would just produce a FAILED CrawlLog row
 * and a Slack alert for work that was never implemented.
 */
export async function listCrawlableResorts(): Promise<ResortSlug[]> {
  const resorts = await prisma.resort.findMany({
    where: { active: true },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return resorts.map((r) => r.slug).filter(isCrawlerRegistered);
}

/**
 * 팬아웃 순서에 손대려던 시도와 그것을 접은 이유 (2026-08-27).
 *
 * 2026-08-27 09:00에 전역 동시성 1로 직렬 수집이 도는 동안 소노와 리솜은 4분 넘게
 * 큐에서 기다렸고, 인스턴스의 `/tmp`가 마른 뒤에야 차례가 와서 **부분 수집이 아니라
 * 0행**으로 끝났다. "줄 끝이 불리하니 날짜로 회전시켜 그 불운을 나누자"는 조치를
 * 실제로 구현했다가 **되돌렸다.** 전제가 관측과 맞지 않았다.
 *
 * 확인한 사실 둘:
 *
 * 1. **여기 순서는 알파벳순이 아니다.** `slug`는 Postgres enum이고 `orderBy: "asc"`는
 *    **선언 순서**로 정렬한다 — 즉 LOTTE, RESOM, HANWHA, OAKVALLEY, SONO다
 *    (`prisma/schema.prisma`의 `enum ResortSlug`). 알파벳순이라고 읽으면 줄 끝이
 *    누구인지부터 틀린다.
 * 2. **그리고 그 순서가 실행 순서가 아니다.** 08-27의 실제 시작 시각은 OAKVALLEY
 *    09:01:09 → HANWHA 09:02:12 → LOTTE 09:02:50 → SONO 09:05:29 → RESOM 09:05:33이다.
 *    발행 순서(LOTTE가 첫 번째)와 맞지 않으므로, **Inngest는 동시성 제한 아래에서
 *    발행 순서를 보장하지 않는다.**
 *
 * 그래서 여기서 순서를 바꾸는 것은 큐에 아무것도 약속하지 못한다. 굶주림의 실제
 * 치료는 스윕을 짧게 만드는 것(지점 병렬화)과 인스턴스가 마르지 않게 하는 것
 * (`_shared/browser.ts`의 회수)이고, 둘 다 그날 함께 들어갔다.
 */
