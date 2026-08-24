import "dotenv/config";
import { runResortCrawl } from "../src/crawlers/run";
import { ResortSlug } from "../src/generated/prisma/enums";
import { parseDate, todayKstIso, addDaysUtc } from "../src/lib/utils";

// Manual crawl trigger for local verification.
//
//   npx tsx scripts/run-crawl.ts                    LOTTE, every branch
//   npx tsx scripts/run-crawl.ts SONO               SONO, every branch
//   npx tsx scripts/run-crawl.ts SONO "소노문 해운대"   one branch
//
// With no branch argument this exercises the defaultSearch() path — the same
// one the admin RefreshButton takes. With a branch it matches what the search
// screen's 최신화 button sends.
async function main() {
  const slug = (process.argv[2] ?? ResortSlug.LOTTE).toUpperCase();
  if (!(slug in ResortSlug)) {
    throw new Error(`Unknown slug: ${slug}. One of ${Object.keys(ResortSlug).join(", ")}`);
  }
  const branch = process.argv[3];

  // `hot` runs the scheduler's own window list instead of a single day. It is
  // the only local way to see the window-skip in action: a crawler whose rows
  // carry their own `stay` answers many windows per request, and that only
  // shows up as `windowsCompleted` racing ahead of the requests it made.
  if (branch === "hot") {
    const { buildHotWindows } = await import("../src/lib/inngest/windows");
    const windows = buildHotWindows().map((w) => ({
      checkin: parseDate(w.checkin),
      checkout: parseDate(w.checkout),
    }));
    const result = await runResortCrawl(slug as ResortSlug, {
      triggeredBy: "MANUAL",
      windows,
      budgetMs: 300_000,
    });
    console.log(`windows requested: ${windows.length}`);
    console.log("RESULT:", JSON.stringify(result, null, 2));
    return;
  }

  const result = await runResortCrawl(slug as ResortSlug, {
    triggeredBy: "MANUAL",
    // 지점 인자가 있으면 요금까지 — `/api/resorts/[slug]/refresh`가 `branch` 유무로
    // 판정하는 것과 **같은 규칙**이다. 두 곳이 갈리면 이 스크립트로 확인한 것이
    // 실제 최신화 버튼이 하는 일과 달라진다.
    ...(branch ? { search: { ...defaultWindow(), branch, withPrices: true } } : {}),
  });
  console.log("RESULT:", JSON.stringify(result, null, 2));
}

/**
 * Today → tomorrow in the app's UTC-midnight convention. `run.ts` has its own
 * `defaultSearch()` but doesn't export it, and re-deriving the dates with the
 * shared helpers is safer than reaching into it.
 */
function defaultWindow() {
  const checkin = parseDate(todayKstIso());
  return { checkin, checkout: addDaysUtc(checkin, 1) };
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
