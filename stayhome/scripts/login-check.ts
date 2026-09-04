import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { ResortSlug } from "@/generated/prisma/enums";
import {
  closeBrowser,
  launchBrowser,
  newContextFromState,
} from "../src/crawlers/_shared/browser";
import { saveStorageState } from "../src/crawlers/_shared/session-store";
import { withDeadline } from "../src/crawlers/_shared/timeout";
import { loadCrawler } from "../src/crawlers/registry";
import type { CrawlerContext } from "../src/crawlers/types";

/**
 * Login-only smoke test for every registered resort.
 *
 *   npx tsx scripts/login-check.ts                 # all five, sequentially
 *   npx tsx scripts/login-check.ts HANWHA SONO     # just these
 *   npx tsx scripts/login-check.ts --save          # keep successful sessions
 *
 * Why this exists rather than the per-resort `debug-*.ts doLogin` steps: those
 * differ in fidelity. LOTTE and HANWHA call the crawler's own `performLogin`,
 * but SONO/RESOM/OAKVALLEY drive the form themselves. The question here is not
 * "does the site accept these credentials" but "does `crawler.login()` work",
 * so all five must take the same path `run.ts` takes.
 *
 * What it deliberately does NOT do:
 *   - write `crawl_logs` / `resort_inventory` (this is a probe, not a crawl)
 *   - write `resort_sessions` unless `--save` is passed
 *   - retry. A real corporate account is behind these; a repeated failed login
 *     risks a lock, and a second attempt tells you nothing the first didn't.
 *   - print credential plaintext. Lengths only.
 *
 * Set CRAWLER_DEBUG_DIR to collect the crawlers' own failure screenshots —
 * without it they are silently skipped.
 */
const STEP_BUDGET_MS = 55_000; // same as run.ts
const SESSION_TTL_MS = 6 * 3600 * 1000;

const ALL: ResortSlug[] = [
  ResortSlug.LOTTE,
  ResortSlug.SONO,
  ResortSlug.RESOM,
  ResortSlug.OAKVALLEY,
  ResortSlug.HANWHA,
];

interface Outcome {
  slug: string;
  ok: boolean;
  durationMs: number;
  /** where it broke: launch | login | verify — or "-" on success */
  stage: string;
  /** `validateSession` after a successful `login()`; null when login threw */
  verified: boolean | null;
  error?: string;
}

async function checkOne(slug: ResortSlug, save: boolean): Promise<Outcome> {
  const startedAt = Date.now();
  let stage = "launch";
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  const logger = (msg: string, meta?: Record<string, unknown>) => {
    console.log(`[login-check ${slug}] ${msg}`, meta ?? "");
  };

  try {
    const resort = await prisma.resort.findUnique({ where: { slug } });
    if (!resort) throw new Error(`Resort row missing: ${slug} — run npm run db:seed`);

    // Same selection run.ts makes, so this probes the row a real crawl uses.
    const account = await prisma.resortAccount.findFirst({
      where: { resortId: resort.id, isPrimary: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!account) {
      throw new Error(`No primary ResortAccount for ${slug}. Add one at /admin/accounts.`);
    }

    const credentials = {
      id: decrypt(account.idEncrypted),
      pw: decrypt(account.pwEncrypted),
      memo: account.memo ?? undefined,
    };
    logger("credentials loaded", {
      idChars: credentials.id.length,
      pwChars: credentials.pw.length,
      memoChars: credentials.memo?.length ?? 0,
    });

    browser = await launchBrowser(logger);
    const crawler = await loadCrawler(slug);
    // Always a cold context: a cached session would make a green result say
    // nothing about login, which is the whole question here.
    const context = await newContextFromState(browser, null);
    const page = await context.newPage();

    const ctx: CrawlerContext = {
      resortId: resort.id,
      slug,
      context,
      page,
      credentials,
      log: logger,
      // 이 스크립트는 로그인만 묻는다. Vercel 예산이 없고 검색도 돌리지 않으므로
      // 마감은 사실상 무한이다 — 크롤러가 이 값 때문에 무언가를 포기하면 그건
      // 측정 대상("크롤러의 로그인이 되나")과 무관한 이유가 된다.
      deadlineAt: Date.now() + 10 * 60_000,
    };

    stage = "login";
    await withDeadline("login", STEP_BUDGET_MS, () => crawler.login(ctx));

    // `login()` returning is not the same as a session standing. HANWHA and
    // OAKVALLEY poll internally; the other three do not, so ask again.
    stage = "verify";
    const verified = await withDeadline("validate", STEP_BUDGET_MS, () =>
      crawler.validateSession(ctx),
    );

    if (save && verified) {
      await saveStorageState(resort.id, context, SESSION_TTL_MS);
      logger("session saved to resort_sessions");
    }

    return {
      slug,
      ok: verified,
      durationMs: Date.now() - startedAt,
      stage: verified ? "-" : "verify",
      verified,
      ...(verified ? {} : { error: "login() returned but validateSession is false" }),
    };
  } catch (e) {
    return {
      slug,
      ok: false,
      durationMs: Date.now() - startedAt,
      stage,
      verified: null,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (browser) await closeBrowser(browser, logger);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const named = args
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toUpperCase())
    .map((a) => {
      if (!(a in ResortSlug)) throw new Error(`Unknown slug: ${a}`);
      return a as ResortSlug;
    });
  const slugs = named.length > 0 ? named : ALL;

  console.log(
    `login-check: ${slugs.join(", ")} | save=${save} | debugDir=${process.env.CRAWLER_DEBUG_DIR ?? "(unset — no screenshots)"}`,
  );

  const outcomes: Outcome[] = [];
  // Sequential on purpose: five concurrent Chromiums on one machine is the
  // condition the 2026-08-20 "browser has been closed" failures shared.
  for (const slug of slugs) {
    console.log(`\n================ ${slug} ================`);
    const outcome = await checkOne(slug, save);
    console.log(
      `---- ${slug}: ${outcome.ok ? "OK" : "FAILED"} in ${outcome.durationMs}ms` +
        (outcome.ok ? "" : ` at stage=${outcome.stage}\n     ${outcome.error}`),
    );
    outcomes.push(outcome);
  }

  console.log("\n================ SUMMARY ================");
  console.table(
    outcomes.map((o) => ({
      slug: o.slug,
      result: o.ok ? "OK" : "FAILED",
      seconds: (o.durationMs / 1000).toFixed(1),
      stage: o.stage,
      error: (o.error ?? "").split("\n")[0].slice(0, 120),
    })),
  );
  const failed = outcomes.filter((o) => !o.ok);
  console.log(`${outcomes.length - failed.length}/${outcomes.length} logged in`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
