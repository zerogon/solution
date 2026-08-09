import { readdir, rm, stat, statfs } from "node:fs/promises";
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
    await sweepStaleProfiles(log);
    log("[browser] resources before launch", await resourceSnapshot());

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
 * Delete Playwright temp profiles left behind by earlier invocations.
 *
 * `browser.close()` removes its own, but a run that dies hard — an exhausted
 * function, a killed invocation — does not get that far, and the next
 * invocation on the same warm instance inherits the debris. Ten leftover
 * profiles are enough to matter next to an extracted Chromium in a 512MB `/tmp`.
 *
 * Only directories older than {@link STALE_PROFILE_MS} are removed, so a
 * concurrently running crawl (a different resort's fan-out landing on this same
 * instance) is never touched — its profile is seconds old.
 */
const STALE_PROFILE_MS = 5 * 60 * 1000;

async function sweepStaleProfiles(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const dir = tmpdir();
  let removed = 0;
  try {
    const entries = await readdir(dir);
    const cutoff = Date.now() - STALE_PROFILE_MS;
    for (const name of entries) {
      if (!PROFILE_PREFIXES.some((p) => name.startsWith(p))) continue;
      const path = join(dir, name);
      try {
        const info = await stat(path);
        if (info.mtimeMs > cutoff) continue;
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
  log("[browser] resources after teardown", await resourceSnapshot());
}
