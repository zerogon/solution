import { readdir, readFile, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { TmpExhaustedError } from "./errors";
import { withRetry } from "./retry";
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
  // Reclaiming only matters where a container is reused; locally `/tmp` is the
  // machine's and the sweep would be doing somebody else's housekeeping.
  if (packUrl) await reclaimTmp(log);

  // Measured for both modes, so `scripts/run-crawl.ts` exercises the same gate
  // production does. Locally the numbers are enormous and nothing below fires.
  const before = await resourceSnapshot();
  log("[browser] resources before launch", before);
  const freeMb = before.tmpFreeMb ?? Number.POSITIVE_INFINITY;
  // Launching below the watermark does not fail here — it succeeds and then
  // dies mid-navigation, reported as the resort site's fault. Name the cause
  // while the evidence is still on disk.
  // The floor can be raised above the warning line by env, so the breakdown has
  // to be gathered whenever either line is crossed — otherwise raising the
  // floor for an experiment would produce a refusal with nothing to read.
  const floorMb = tmpFloorMb();
  if (freeMb < Math.max(TMP_LOW_MB, floorMb)) {
    const usedMb =
      before.tmpTotalMb !== undefined && before.tmpFreeMb !== undefined
        ? before.tmpTotalMb - before.tmpFreeMb
        : undefined;
    const { entries, unaccountedMb } = await tmpBreakdown(usedMb);
    log("[browser] /tmp is low — what is holding it", { entries, unaccountedMb });
    // Below the floor, "succeeds and then dies" is no longer a risk but the
    // outcome. Refuse here, where the message can still say what is true.
    if (freeMb < floorMb) {
      throw new TmpExhaustedError(
        `/tmp에 브라우저를 띄울 자리가 없다 (여유 ${freeMb}MB / ${
          before.tmpTotalMb ?? "?"
        }MB, 하한 ${floorMb}MB, rss ${before.rssMb}MB${
          unaccountedMb === null ? "" : `, 목록에 없는 ${unaccountedMb}MB`
        }). 붙잡고 있는 것: ${entries.join(", ") || "(알 수 없음)"}`,
      );
    }
  }

  if (packUrl) {
    // Production / Vercel: always headless (no display available)
    const chromiumMin = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await chromiumMin.executablePath(packUrl);
    const args = await packArgs(log);
    const profilesBefore = await listProfiles();
    const browser = await withRetry(
      "chromium.launch",
      () => chromium.launch({ args, executablePath, headless: true }),
      {
        attempts: ETXTBSY_ATTEMPTS,
        initialDelayMs: ETXTBSY_DELAY_MS,
        shouldRetry: isTextFileBusy,
      },
    );
    return rememberOwnProfile(browser, profilesBefore, log);
  }
  // Local dev: respect CRAWLER_HEADLESS env so we can watch the browser
  // while debugging selectors. Default is headless to match production.
  const headless = process.env.CRAWLER_HEADLESS !== "false";
  // `CRAWLER_PACK_ARGS=1` borrows production's flag set while keeping the local
  // chromium and the local exit IP. Without it there is no way to ask whether a
  // site is refusing our address or our browser: the two only ever differed
  // together. See the LOTTE note in CLAUDE.md.
  const profilesBefore = await listProfiles();
  const browser = process.env.CRAWLER_PACK_ARGS
    ? await chromium.launch({ args: await packArgs(log), headless })
    : await chromium.launch({ headless });
  return rememberOwnProfile(browser, profilesBefore, log);
}

/**
 * The `--user-data-dir` this launch created, for the browsers we still hold.
 *
 * Keyed on the `Browser` so it cannot outlive it, the same shape HANWHA's
 * `booted` map uses. Only `closeBrowser` reads it, and only when a close has
 * already been abandoned.
 */
const ownProfile = new WeakMap<Browser, string>();

/** Full paths of every Playwright profile directory currently in `/tmp`. */
async function listProfiles(): Promise<Set<string>> {
  try {
    const dir = tmpdir();
    const names = await readdir(dir);
    return new Set(names.filter((n) => n.startsWith("playwright_")).map((n) => join(dir, n)));
  } catch {
    return new Set();
  }
}

/**
 * Work out which profile directory belongs to the browser we just launched.
 *
 * `chromium.launch()` exposes neither the pid nor the profile path (only
 * `launchServer()` does, and switching to it would change how every crawler
 * connects), so this diffs `/tmp` across the launch. Exactly one new directory
 * means it is ours.
 *
 * Zero or several means we do not know — a sibling invocation launched at the
 * same moment, or a retried launch left one behind — and then nothing is
 * recorded. That is the safety line for the whole mechanism: `closeBrowser`
 * only ever kills a process whose `--user-data-dir` is the exact path recorded
 * here, so "unsure" degrades to the old behaviour rather than to killing
 * somebody else's browser.
 */
async function rememberOwnProfile(
  browser: Browser,
  before: Set<string>,
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<Browser> {
  try {
    const fresh = [...(await listProfiles())].filter((p) => !before.has(p));
    if (fresh.length === 1) ownProfile.set(browser, fresh[0]);
    else log("[browser] could not identify own profile dir", { candidates: fresh.length });
  } catch {
    // Identification is an optimization; never let it fail a launch.
  }
  return browser;
}

/**
 * "Text file busy": we tried to exec a binary another process still has open
 * for writing.
 *
 * The writer is `@sparticuz/chromium-min` inflating `/tmp/chromium`, and the
 * other process is a sibling invocation doing the same thing on the same warm
 * instance. It is transient by construction — it ends when that write ends —
 * and it is the one launch failure worth retrying.
 *
 * Nothing else is retried here, deliberately. A launch that failed because the
 * container is out of resources would only be asked to try again on an even
 * emptier `/tmp`, and the second failure would arrive later and read the same.
 */
function isTextFileBusy(e: unknown): boolean {
  return e instanceof Error && e.message.includes("ETXTBSY");
}

/**
 * Three tries a second apart. The inflation this waits on is measured in
 * seconds, and the whole retry budget has to fit inside a 50s pass that still
 * has a login and some windows ahead of it.
 *
 * `withRetry` rewraps the cause into its own message, so an exhausted retry
 * lands in `crawl_logs` as `chromium.launch failed after 3 attempts: …ETXTBSY`
 * — which is the more useful sentence anyway: it says we already tried.
 */
const ETXTBSY_ATTEMPTS = 3;
const ETXTBSY_DELAY_MS = 1_000;

/**
 * Flags `@sparticuz/chromium-min` sets that we may choose not to inherit.
 *
 * The library tunes for "boot a browser in a serverless container at all",
 * which is not the same goal as "look like the browser a person would use".
 * Two groups are separable and each is its own experiment:
 *
 *   isolation — puts cross-origin frames in the renderer of their parent.
 *     LOTTE's login is a `members.lpoint.com` frame inside a lottehotel.com
 *     page that has to hand control back to its parent, and that handoff is
 *     the exact hop production stops at.
 *   websec — same-origin policy off. Nothing we crawl needs it, and a page
 *     that checks `event.origin` before accepting a message is entitled to a
 *     different answer when it is off.
 *
 * Dropping either costs memory and process count, which on Vercel is `/tmp`
 * and RSS — the resource this file already exists to protect. So they are
 * dropped deliberately, one at a time, with the resource snapshots read.
 */
const PACK_ARG_GROUPS: Record<string, string[]> = {
  isolation: [
    "--single-process",
    "--no-zygote",
    "--disable-site-isolation-trials",
    "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
  ],
  websec: ["--disable-web-security", "--allow-running-insecure-content"],
};

/**
 * Which groups to leave behind. Empty means "behave exactly as before".
 *
 * `CRAWLER_DROP_PACK_ARGS=isolation,websec` overrides it for an experiment so a
 * question can be asked without a code change — but the answer, once known,
 * belongs in this constant where it is reviewable.
 */
const DROPPED_PACK_ARG_GROUPS: string[] = [];

async function packArgs(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<string[]> {
  const chromiumMin = (await import("@sparticuz/chromium-min")).default;
  const dropped = (process.env.CRAWLER_DROP_PACK_ARGS ?? DROPPED_PACK_ARG_GROUPS.join(","))
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const drop = new Set(dropped.flatMap((g) => PACK_ARG_GROUPS[g] ?? []));
  const unknown = dropped.filter((g) => !PACK_ARG_GROUPS[g]);
  if (unknown.length) log("[browser] unknown pack-arg group, ignored", { unknown });

  const args = chromiumMin.args.filter((a) => !drop.has(a));
  if (drop.size) {
    log("[browser] pack args dropped", {
      groups: dropped,
      // Say what was actually removed, not what we meant to remove: the
      // library rewords its own flags between releases and a stale entry here
      // would silently drop nothing while the log claimed otherwise.
      removed: chromiumMin.args.filter((a) => drop.has(a)),
    });
  }
  return [...args, ...EXTRA_ARGS];
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

/**
 * What a finished crawl leaves in `/tmp`, in two kinds.
 *
 * `playwright_*` is the launch's `--user-data-dir`, and a live process names it
 * in `/proc` — so those are judged by the kernel (see `sweepStaleProfiles`).
 *
 * The rest are named by nobody. `playwright-artifacts-*` is not a user-data-dir,
 * and the `.org.chromium.*` / `.com.google.Chrome.*` scratch directories are
 * Chromium's own — it puts shared memory there because `EXTRA_ARGS` carries
 * `--disable-dev-shm-usage`, which redirects `/dev/shm` into `/tmp` precisely
 * so a small container shm cannot fail the browser. Those fall back to the age
 * rule, which is sound here: every route that launches a browser is capped at
 * `maxDuration = 60`, so 90 seconds of no writes cannot be a live invocation.
 *
 * ⚠️ No prefix here may match `/tmp/chromium` (the inflated binary) or
 * `/tmp/chromium-pack` (handled by `dropExtractedPack`, which knows the
 * ordering rule this list does not). Deleting the binary mid-sweep would take
 * out every crawl on the instance, and the symptom would be a launch failure
 * blamed on the pack URL.
 */
const TMP_DEBRIS_PREFIXES = [
  "playwright_",
  "playwright-artifacts-",
  ".org.chromium.Chromium.",
  ".com.google.Chrome.",
  "chromium-crashpad",
];

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
export const TMP_LOW_MB = 120;

/**
 * Free `/tmp` below which we refuse to launch at all.
 *
 * `TMP_LOW_MB` is the line where a launch becomes risky and worth describing;
 * this is the line below which it is simply going to fail, and failing here is
 * cheaper and truer than failing three navigations later under a message that
 * blames the resort's site. Set under the warning line rather than equal to it
 * so the band between them keeps producing `tmpBreakdown` evidence from runs
 * that still succeed — that band is where a ratchet is visible before it bites.
 */
const TMP_FLOOR_MB = 80;

/**
 * The floor in force, overridable by `CRAWLER_TMP_FLOOR_MB`.
 *
 * The override exists for the same reason `CRAWLER_DROP_PACK_ARGS` does: this
 * branch is unreachable on a developer machine — `/tmp` there is the machine's,
 * measured in gigabytes — so without a way to raise the floor the refusal path
 * would ship having never once executed. The answer, when there is one, belongs
 * in the constant above; the env var is for asking.
 */
function tmpFloorMb(): number {
  const raw = Number(process.env.CRAWLER_TMP_FLOOR_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : TMP_FLOOR_MB;
}

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
  // Before the profile sweep, not after: a browser that is still running holds
  // its profile in `/proc`, and the sweep will correctly refuse to touch it.
  // Ending the process is what makes the directory sweepable at all.
  await reapOrphanBrowsers(log);
  await sweepStaleProfiles(log);
}

/**
 * How long a Chromium must have been running before nobody can still own it.
 *
 * Every route that launches a browser declares `maxDuration = 60`, so a process
 * older than 90 seconds cannot belong to a live invocation — the same argument
 * `STALE_PROFILE_MS` makes about directories, applied to the thing that holds
 * them. This is the guard that does not depend on us having recorded anything,
 * which matters because the case it exists for is the one where we recorded
 * nothing.
 */
const ORPHAN_MIN_AGE_MS = 90 * 1000;

/**
 * Kill Chromiums that no invocation can still be using.
 *
 * `closeBrowser` handles the browser it was handed. It cannot handle the one
 * nobody hands back: when Vercel kills a function at `maxDuration`, `finally`
 * never runs, so there is no teardown, no `CrawlLog` close, and a live Chromium
 * inherits the instance. From then on `sweepStaleProfiles` skips that profile
 * forever — correctly, because a process really is using it — and the space is
 * gone until the instance dies. That is the same permanent loss abandonment
 * causes, arriving by a route teardown cannot cover.
 *
 * Age is the only test, and it is deliberately the only test. A registry of
 * "our" pids would be per-route-bundle (Next compiles `/api/inngest` and
 * `/api/resorts/[slug]/refresh` separately, so each holds its own copy of this
 * module) and would therefore be blind to the other route's live browser —
 * which is the one case where being wrong means killing a running crawl. 90
 * seconds against a 60-second `maxDuration` is a fact about the platform rather
 * than a fact about our bookkeeping, so it cannot go stale.
 */
async function reapOrphanBrowsers(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  // **Vercel에서만 돈다.** 90초라는 나이 기준이 안전한 것은 `maxDuration`이 60초라는
  // 플랫폼 사실 때문인데, 개발 머신에는 그런 상한이 없다. 로컬에서 이걸 돌리면
  // `SONO_FLOW_MANUAL=1 NET_WAIT_MS=180000`처럼 **사람이 3분간 손으로 모는 브라우저**를
  // 다른 크롤의 teardown이 죽인다. 여기서 근거가 사라지면 기능도 사라져야 한다.
  if (!process.env.VERCEL) return;
  try {
    const uptime = await procUptimeMs();
    if (uptime === null) return; // no /proc — local dev keeps its old behaviour
    const inUse = await profilesInUse();
    if (inUse === null) return;

    let reaped = 0;
    for (const [profile, pid] of inUse) {
      if (!profile.startsWith(join(tmpdir(), "playwright_"))) continue;
      const age = await processAgeMs(pid, uptime);
      if (age === null || age < ORPHAN_MIN_AGE_MS) continue;
      try {
        process.kill(pid, "SIGKILL");
        reaped++;
      } catch {
        // Already gone between the read and the signal. Fine either way.
      }
    }
    if (reaped > 0) log("[browser] reaped orphaned browsers", { reaped });
  } catch {
    // Reaping is an optimization; never let it fail a crawl.
  }
}

/** Milliseconds since boot, or null where `/proc` cannot be read. */
async function procUptimeMs(): Promise<number | null> {
  try {
    const [seconds] = (await readFile("/proc/uptime", "utf8")).split(" ");
    const v = Number(seconds);
    return Number.isFinite(v) ? v * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * How long a pid has been running, from `/proc/<pid>/stat` field 22.
 *
 * The line is parsed from the last `)` rather than by splitting on spaces:
 * field 2 is the executable name in parentheses and may itself contain spaces,
 * which shifts every later field for exactly the processes we care about.
 *
 * `USER_HZ` is 100 on every Linux Vercel runs and Node exposes no `sysconf`, so
 * it is assumed. Being wrong there only ever makes the computed age *smaller*
 * than the truth (real USER_HZ values are ≥ 100), which errs toward sparing a
 * process — the safe direction.
 */
async function processAgeMs(pid: number, uptimeMs: number): Promise<number | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const tail = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    // tail[0] is field 3 (state), so field 22 (starttime) is tail[19].
    const ticks = Number(tail[19]);
    if (!Number.isFinite(ticks)) return null;
    return uptimeMs - (ticks / 100) * 1000;
  } catch {
    return null;
  }
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
      if (!TMP_DEBRIS_PREFIXES.some((p) => name.startsWith(p))) continue;
      const path = join(dir, name);
      try {
        // Only `playwright_*` is a `--user-data-dir`. Everything else in
        // TMP_DEBRIS_PREFIXES is named by no process, so `/proc` can never
        // vouch for it either way — those stay on the age rule.
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
 * Every `--user-data-dir` a live process is currently running with, mapped to
 * the pid holding it — or null where `/proc` cannot be read.
 *
 * The pid is carried rather than discarded because two callers need different
 * halves of the same scan: `sweepStaleProfiles` only asks whether a directory
 * is spoken for, while `closeBrowser` needs to reach the process that abandoned
 * one and end it. A `Map` answers `has()` exactly as the old `Set` did, so the
 * sweep is unchanged.
 *
 * Where one directory is named by several pids (Chromium's own children), the
 * last one wins. That is fine for the sweep, which only reads `has()`, and for
 * the kill, which targets the browser process — killing any member of the group
 * with SIGKILL releases the directory either way.
 */
async function profilesInUse(): Promise<Map<string, number> | null> {
  const FLAG = "--user-data-dir=";
  try {
    const pids = (await readdir("/proc")).filter((n) => /^\d+$/.test(n));
    const inUse = new Map<string, number>();
    for (const pid of pids) {
      let argv: string;
      try {
        argv = await readFile(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        continue; // the process exited between readdir and read
      }
      for (const arg of argv.split("\0")) {
        if (arg.startsWith(FLAG)) inUse.set(arg.slice(FLAG.length), Number(pid));
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

/**
 * The biggest things in `/tmp`, largest first, plus how much of the used space
 * they fail to explain.
 *
 * `unaccountedMb` is the number that matters most and the one a directory
 * listing can never show. Chromium creates its shared-memory segments in `/tmp`
 * (because `EXTRA_ARGS` carries `--disable-dev-shm-usage`) and unlinks them
 * immediately while keeping the descriptor open — the space stays consumed and
 * the name is gone, so `readdir` cannot see it and no sweep can reclaim it.
 * Only ending the process that holds the fd frees it.
 *
 * Without this figure the low-space diagnostic can print a tidy breakdown that
 * sums to a fraction of what is actually gone, and the reader concludes the
 * sweep is working. A large `unaccountedMb` says the opposite: what is holding
 * `/tmp` is a live process, not debris.
 *
 * Only meaningful where `/tmp` is a filesystem of its own, which on Vercel it
 * is (525MB, ours alone). On a dev machine `/tmp` usually shares the root
 * filesystem, so "used" counts the whole disk and this number is nonsense —
 * harmless, because the branch that prints it is unreachable there without
 * `CRAWLER_TMP_FLOOR_MB`.
 */
async function tmpBreakdown(
  usedMb: number | undefined,
  limit = 8,
): Promise<{ entries: string[]; unaccountedMb: number | null }> {
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
    const visibleMb = Math.round(
      sized.reduce((sum, [, bytes]) => sum + bytes, 0) / 1024 / 1024,
    );
    return {
      entries: sized
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, bytes]) => `${name} ${Math.round(bytes / 1024 / 1024)}MB`),
      unaccountedMb: usedMb === undefined ? null : Math.max(0, usedMb - visibleMb),
    };
  } catch {
    return { entries: [], unaccountedMb: null };
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
 * Playwright's `launch()` exposes no process to kill, so this stops *waiting*
 * and says so. But stopping the wait is not the end of it: the abandoned
 * Chromium stays alive, keeps naming its `--user-data-dir` in `/proc`, and
 * `sweepStaleProfiles` therefore skips that profile **correctly, forever** —
 * one abandonment pins a slice of `/tmp` (and its RSS) for the instance's whole
 * life. That is the ratchet that killed the 2026-08-27 09:00 sweep: seven
 * passes launched on one warm instance and the eighth had nowhere left to go.
 *
 * So the abandonment is now followed by `reapAbandoned`, which finds the pid
 * through the profile path this launch recorded and SIGKILLs it. The wait stays
 * short — this is a second line, not a licence to wait longer.
 */
/**
 * 닫히기를 기다리는 한계. 정상 종료는 1초 미만이고, 이 값이 곧 `run.ts`의
 * `TEARDOWN_RESERVE_MS`를 지배한다 — 예산(50초) 위에 얹히는 시간이라
 * 10초였을 때 소노 패스가 59.3초로 60초 벽에 1초를 남겼다(2026-08-26).
 */
export const CLOSE_TIMEOUT_MS = 5_000;

export async function closeBrowser(
  browser: Browser,
  log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
  timeoutMs = CLOSE_TIMEOUT_MS,
): Promise<{ abandoned: boolean; reaped: boolean }> {
  const closed = await Promise.race([
    browser.close().then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]).catch(() => false);

  let reaped = false;
  if (!closed) {
    log("[browser] close did not finish in time — abandoning it", { timeoutMs });
    reaped = await reapAbandoned(browser, log);
  }
  // The invocation that made the mess is the only one that knows it is done.
  // Leaving it for the next crawl's pre-launch sweep does not work: by then the
  // debris is too young for any age cutoff that is safe under concurrency.
  await reclaimTmp(log);
  log("[browser] resources after teardown", await resourceSnapshot());
  return { abandoned: !closed, reaped };
}

/** How long to wait for SIGKILL to be reflected in `/proc` before giving up. */
const REAP_CONFIRM_MS = 500;

/**
 * End the Chromium that outlived its `close()`, and delete its profile.
 *
 * Three guards, and all three are the point rather than defensive padding:
 *
 *   1. **We kill only the path we recorded at launch.** `ownProfile` holds the
 *      directory this launch created; a pid is a target only if its
 *      `--user-data-dir` is exactly that string. If the launch could not
 *      identify its own profile, nothing is killed. Under concurrency the
 *      alternative — inferring ownership from age or from "the only chromium
 *      around" — would eventually kill a sibling invocation's live browser, and
 *      that failure would look exactly like the one we are fixing.
 *   2. **No `/proc`, no kill.** `profilesInUse()` returns null off Linux, so
 *      local development keeps the old abandon-and-move-on behaviour.
 *   3. **Nothing here may fail the crawl.** The run has already finished its
 *      work by the time teardown runs; a cleanup that throws would convert a
 *      successful pass into a failed one.
 *
 * The directory is removed only after the process is confirmed gone. Removing
 * it out from under a live Chromium is how you get a browser that half-works.
 */
async function reapAbandoned(
  browser: Browser,
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<boolean> {
  const profile = ownProfile.get(browser);
  if (!profile) {
    log("[browser] abandoned browser left in place — its profile dir is unknown");
    return false;
  }
  try {
    const inUse = await profilesInUse();
    if (inUse === null) {
      log("[browser] abandoned browser left in place — /proc unreadable");
      return false;
    }
    const pid = inUse.get(profile);
    if (pid === undefined) {
      // It exited on its own between the timeout and now; the profile is ours
      // to delete either way.
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
      return true;
    }

    process.kill(pid, "SIGKILL");
    const deadline = Date.now() + REAP_CONFIRM_MS;
    let gone = false;
    while (Date.now() < deadline) {
      const still = await profilesInUse();
      if (still === null || !still.has(profile)) {
        gone = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!gone) {
      log("[browser] SIGKILL sent but the profile is still held", { pid });
      return false;
    }
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    log("[browser] reaped abandoned browser", { pid });
    return true;
  } catch (e) {
    log("[browser] could not reap abandoned browser", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
