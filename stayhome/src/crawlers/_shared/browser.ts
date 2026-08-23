import { readdir, readFile, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import type { StorageStateJSON } from "./session-store";

/**
 * Launch a Chromium browser.
 *
 * Two modes:
 *   1. Production / Vercel: `CHROMIUM_PACK_URL` env points to a tarball
 *      compatible with `@sparticuz/chromium-min`. The browser binary is
 *      downloaded to `/tmp` on cold start and reused while warm.
 *   2. Local dev: when `CHROMIUM_PACK_URL` is empty, fall back to letting
 *      playwright resolve a system-installed chromium (works after
 *      `npx playwright install chromium`).
 *
 * The pack version must track `playwright-core`'s expected Chromium
 * (`node_modules/playwright-core/browsers.json` → `browserVersion`). They were
 * 17 major versions apart once — the launch itself would still succeed, so the
 * mismatch would surface later as CDP calls failing for no visible reason.
 *
 * On Vercel a missing `CHROMIUM_PACK_URL` is fatal rather than a fallback: the
 * dev branch there hunts for a system chromium that a serverless filesystem
 * never has, and the resulting "run `npx playwright install`" message reads
 * like a local setup mistake rather than an unset env var.
 */
export async function launchBrowser(
  log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
): Promise<Browser> {
  const packUrl = process.env.CHROMIUM_PACK_URL;
  if (!packUrl && process.env.VERCEL) {
    throw new Error(
      "CHROMIUM_PACK_URL이 비어 있다. Vercel에는 시스템 크로미움이 없으므로 " +
        "@sparticuz/chromium-min 팩 URL이 반드시 필요하다 " +
        "(버전은 playwright-core의 browsers.json과 맞출 것).",
    );
  }
  if (packUrl) {
    await reclaimTmp(log);
    const before = await resourceSnapshot();
    log("[browser] resources before launch", before);
    // Launching below the watermark does not fail here — it succeeds and then
    // dies mid-navigation, reported as the resort site's fault. Name the cause
    // while the evidence is still on disk.
    if ((before.tmpFreeMb ?? Number.POSITIVE_INFINITY) < TMP_LOW_MB) {
      log("[browser] /tmp is low — what is holding it", {
        entries: await tmpBreakdown(),
      });
    }

    // Production / Vercel: always headless (no display available)
    const chromiumMin = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await chromiumMin.executablePath(packUrl);
    return chromium.launch({
      args: [...chromiumMin.args, ...EXTRA_ARGS],
      executablePath,
      headless: true,
    });
  }
  // Local dev: respect CRAWLER_HEADLESS env so we can watch the browser
  // while debugging selectors. Default is headless to match production.
  const headless = process.env.CRAWLER_HEADLESS !== "false";
  return chromium.launch({ headless });
}

/**
 * Args added on top of `@sparticuz/chromium-min`'s own, all of them about not
 * consuming a serverless container's `/tmp`.
 *
 * The failure they exist for: a scheduled crawl whose retries land on the same
 * warm instance eventually got `net::ERR_INSUFFICIENT_RESOURCES` from
 * `page.goto` in 350ms — the browser launched fine and then could not allocate
 * anything. `/tmp` is 512MB on Vercel and already holds the extracted Chromium,
 * so it is the resource with the least headroom.
 */
const EXTRA_ARGS = [
  // chromium-min sets 32MB. We make a handful of JSON API calls per run and
  // never revisit a URL, so the cache buys nothing and costs /tmp per launch.
  "--disk-cache-size=1",
  "--media-cache-size=1",
  // /dev/shm is small in containers; without this Chromium can fail in ways
  // that look like memory pressure rather than a shm limit.
  "--disable-dev-shm-usage",
];

/** Playwright's per-launch temp profile directories. */
const PROFILE_PREFIXES = ["playwright_", "playwright-artifacts-"];

/**
 * How old a leftover must be before age alone proves nobody is using it.
 *
 * Every route that launches a browser is capped at `maxDuration = 60`, so a
 * directory untouched for 90 seconds cannot belong to a live invocation. This
 * used to be 5 minutes, which was safe but useless: the debris that actually
 * fills `/tmp` is seconds old when the next crawl starts, so the sweep found
 * nothing and the next crawl launched into a full disk anyway.
 */
const STALE_PROFILE_MS = 90 * 1000;

/**
 * Free `/tmp` below which a browser will launch and then fail in ways that read
 * like the resort site's fault (`ERR_INSUFFICIENT_RESOURCES`, "Target page,
 * context or browser has been closed").
 *
 * Measured on Vercel 2026-08-23: a fresh instance has 513MB of 525MB free, one
 * HANWHA crawl ends at 17MB, and every crawl that lands on that warm instance
 * afterwards fails — including Inngest's own retries, which is how a single
 * heavy crawl turned into five failed resorts.
 */
const TMP_LOW_MB = 120;

/**
 * Give `/tmp` back what the last crawl left in it.
 *
 * Run before launch *and* after teardown. Before-only was the old shape and it
 * cannot work: the leftovers are newer than any safe age cutoff at that point,
 * and the invocation that made them is the one that knows they are finished.
 */
async function reclaimTmp(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  await dropExtractedPack(log);
  await sweepStaleProfiles(log);
}

/**
 * Delete the compressed pack `@sparticuz/chromium-min` downloaded, once the
 * binary it carries has been inflated.
 *
 * The library extracts the tarball to `/tmp/chromium-pack`, inflates
 * `chromium.br` · `fonts.tar.br` · `swiftshader.tar.br` out of it into `/tmp`,
 * and never removes it. But its own `executablePath()` returns early whenever
 * `/tmp/chromium` exists, so from the second launch on this instance nothing
 * will ever read the pack again — it is a compressed second copy of a browser
 * we already have, sitting in a 525MB filesystem next to the extracted one.
 *
 * Guarded on `/tmp/chromium` existing precisely because that is the same
 * condition the library short-circuits on: if the binary is there, the pack is
 * unreachable code; if it is not, the pack is still the source and we leave it.
 */
async function dropExtractedPack(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const binary = join(tmpdir(), "chromium");
  const pack = join(tmpdir(), "chromium-pack");
  try {
    await stat(binary);
  } catch {
    return; // no inflated binary yet — the pack is still the source
  }
  let freedMb: number;
  try {
    freedMb = Math.round((await dirSize(pack)) / 1024 / 1024);
  } catch {
    return; // no pack to drop
  }
  await rm(pack, { recursive: true, force: true }).catch(() => undefined);
  if (freedMb > 0) log("[browser] dropped extracted chromium pack", { freedMb });
}

/**
 * Delete Playwright temp profiles left behind by earlier invocations.
 *
 * `browser.close()` removes its own, but a run that dies hard — an exhausted
 * function, a killed invocation — does not get that far, and the next
 * invocation on the same warm instance inherits the debris.
 *
 * Ownership is decided by asking the kernel, not the clock: a profile that no
 * live process names in its `--user-data-dir` is finished, whatever its mtime.
 * That matters because a concurrent crawl's profile is exactly as young as our
 * own, so an age test either spares both or deletes both. `/proc` is only
 * readable on Linux; anywhere else this falls back to {@link STALE_PROFILE_MS}.
 */
async function sweepStaleProfiles(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const dir = tmpdir();
  const inUse = await profilesInUse();
  let removed = 0;
  try {
    const entries = await readdir(dir);
    const cutoff = Date.now() - STALE_PROFILE_MS;
    for (const name of entries) {
      if (!PROFILE_PREFIXES.some((p) => name.startsWith(p))) continue;
      const path = join(dir, name);
      try {
        // `playwright-artifacts-*` is not a user-data-dir, so no process names
        // it and /proc can never vouch for it — it stays on the age rule.
        const askKernel = inUse !== null && name.startsWith("playwright_");
        if (askKernel) {
          if (inUse!.has(path)) continue;
        } else {
          const info = await stat(path);
          if (info.mtimeMs > cutoff) continue;
        }
        await rm(path, { recursive: true, force: true });
        removed++;
      } catch {
        // Racing with another invocation's cleanup is fine — it is gone either way.
      }
    }
  } catch {
    // Sweeping is an optimization; never let it fail a crawl.
  }
  if (removed > 0) log("[browser] swept stale profiles", { removed });
}

/**
 * Every `--user-data-dir` a live process is currently running with, or null
 * where `/proc` cannot be read.
 */
async function profilesInUse(): Promise<Set<string> | null> {
  const FLAG = "--user-data-dir=";
  try {
    const pids = (await readdir("/proc")).filter((n) => /^\d+$/.test(n));
    const inUse = new Set<string>();
    for (const pid of pids) {
      let argv: string;
      try {
        argv = await readFile(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        continue; // the process exited between readdir and read
      }
      for (const arg of argv.split("\0")) {
        if (arg.startsWith(FLAG)) inUse.add(arg.slice(FLAG.length));
      }
    }
    return inUse;
  } catch {
    return null;
  }
}

/** Recursive size in bytes, capped so a pathological tree cannot stall a crawl. */
async function dirSize(path: string, budget = { entries: 20_000 }): Promise<number> {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const name of await readdir(path)) {
    if (budget.entries-- <= 0) break;
    try {
      total += await dirSize(join(path, name), budget);
    } catch {
      // vanished mid-walk; it is not holding anything either way
    }
  }
  return total;
}

/** The biggest things in `/tmp`, largest first, as `"name 123MB"`. */
async function tmpBreakdown(limit = 8): Promise<string[]> {
  const dir = tmpdir();
  try {
    const sized: Array<[string, number]> = [];
    for (const name of await readdir(dir)) {
      try {
        sized.push([name, await dirSize(join(dir, name))]);
      } catch {
        // ignore
      }
    }
    return sized
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, bytes]) => `${name} ${Math.round(bytes / 1024 / 1024)}MB`);
  } catch {
    return [];
  }
}

/**
 * What the container has left. Logged around launch and teardown so a leak
 * shows up as a delta instead of as a mysterious 350ms failure.
 */
export async function resourceSnapshot(): Promise<Record<string, number>> {
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
  const snapshot: Record<string, number> = { rssMb: mb(process.memoryUsage().rss) };
  try {
    const fs = await statfs(tmpdir());
    snapshot.tmpFreeMb = mb(fs.bavail * fs.bsize);
    snapshot.tmpTotalMb = mb(fs.blocks * fs.bsize);
  } catch {
    // statfs is unavailable on some platforms; the rss number still helps.
  }
  return snapshot;
}

export async function newContextFromState(
  browser: Browser,
  storageState: StorageStateJSON | null | undefined,
): Promise<BrowserContext> {
  return browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent:
      // Modest desktop UA; resort sites are usually content with this.
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ...(storageState ? { storageState: storageState as never } : {}),
  });
}

/**
 * Tear a browser down without letting the teardown itself hang the run.
 *
 * `await browser.close().catch(() => undefined)` looks safe but isn't: if the
 * close *hangs* — a plausible outcome for a browser that just ran out of
 * resources — it blocks until the whole function is killed, and that exit is
 * exactly the one that leaves the CrawlLog open and the profile directory
 * behind for the next invocation to inherit.
 *
 * There is no public way to kill the process from a `launch()`ed Browser, so
 * this does not promise one: it stops *waiting*, says so, and lets the run
 * finish writing its log. The leftover is then somebody's problem — which is
 * what `sweepStaleProfiles` is for on the next launch.
 */
export async function closeBrowser(
  browser: Browser,
  log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
  timeoutMs = 10_000,
): Promise<void> {
  const closed = await Promise.race([
    browser.close().then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]).catch(() => false);

  if (!closed) log("[browser] close did not finish in time — abandoning it", { timeoutMs });
  // The invocation that made the mess is the only one that knows it is done.
  // Leaving it for the next crawl's pre-launch sweep does not work: by then the
  // debris is too young for any age cutoff that is safe under concurrency.
  await reclaimTmp(log);
  log("[browser] resources after teardown", await resourceSnapshot());
}
