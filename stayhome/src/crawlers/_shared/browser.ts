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
  // 결과는 버린다 — 이 자리의 회수는 바로 아래 스냅샷에 이미 반영돼 있고, 노트로
  // 남길 값어치가 있는 것은 자기가 만든 잔해를 치우는 teardown 쪽이다.
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
    const core = await coreDumpPolicy();
    log("[browser] /tmp is low — what is holding it", { entries, unaccountedMb, ...core });
    // Below the floor, "succeeds and then dies" is no longer a risk but the
    // outcome. Refuse here, where the message can still say what is true.
    if (freeMb < floorMb) {
      throw new TmpExhaustedError(
        `/tmp에 브라우저를 띄울 자리가 없다 (여유 ${freeMb}MB / ${
          before.tmpTotalMb ?? "?"
        }MB, 하한 ${floorMb}MB, rss ${before.rssMb}MB${
          unaccountedMb === null ? "" : `, 목록에 없는 ${unaccountedMb}MB`
        }). 붙잡고 있는 것: ${entries.join(", ") || "(알 수 없음)"}${
          core.corePattern === undefined
            ? ""
            : `, core_pattern ${core.corePattern} (limit ${core.coreLimit ?? "?"})`
        }`,
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
 *
 * ⚠️ 이 목록은 잔해 **전체**가 아니라 두 부류다 — 커널이 판정하는 `playwright_`와
 * 시계가 판정하는 나머지. 어느 판정자에도 답할 수 없는 세 번째 부류(코어 덤프)는
 * {@link CORE_DUMP_NAME}에 따로 산다. 거기에 접두사를 하나 더 얹어 해결하려 하면
 * 이 주석이 거짓이 되고, 그 방식이 조용히 실패하는 이유는 바로 아래에 적혀 있다.
 */
const TMP_DEBRIS_PREFIXES = [
  "playwright_",
  "playwright-artifacts-",
  ".org.chromium.Chromium.",
  ".com.google.Chrome.",
  "chromium-crashpad",
];

/**
 * 커널이 남긴 코어 덤프. **나이를 묻지 않고 지운다.**
 *
 * 2026-08-29 09:00 팬아웃이 이것으로 무너졌다. 동시성 1이라 다섯 리조트가 워밍
 * 인스턴스 하나에서 직렬로 돌았고, 세 번째 teardown 뒤 `/tmp`에 `core.chromium.18`
 * 298MB와 `core.chromium.109` 100MB가 남아 오크밸리·리솜·소노가 전부
 * `TMP_EXHAUSTED`로 거절됐다. 결정적인 것은 진단이 말한 **`목록에 없는 0MB`**였다 —
 * 살아 있는 프로세스가 unlink된 fd로 붙잡고 있는 게 아니라, 이름이 멀쩡히 있는
 * 파일이 그냥 거기 있었다. 어떤 sweep도 그 이름을 몰랐을 뿐이다.
 *
 * **왜 생기나**: {@link PACK_ARG_GROUPS}의 `isolation`이 실는 `--single-process`
 * `--no-zygote`로 뜬 크로미움은 끝날 때 자주 segfault한다. 패스 자체는 SUCCESS였고
 * `browser.close()`도 정상 resolve했으니 이건 죽는 순간의 사고다. 커널은
 * `core_pattern`(`core.%e.%p`)대로 덤프를 쓰고 크기는 그 프로세스의 RSS —
 * 298MB·100MB가 그 시각 teardown 로그의 rss 346MB·410MB와 그대로 맞는다. SIGKILL은
 * 코어를 남기지 않으므로 `reapAbandoned`/`reapOrphanBrowsers`는 범인이 아니다.
 * **평범하게 잘 닫힌 브라우저가 남기는 잔해다.**
 *
 * **여기에 나이 기준을 붙이면 이 sweep은 하는 일이 없다.** 덤프는 teardown 그 순간에
 * 생기고, 그걸 지울 수 있는 유일한 호출도 같은 teardown의 {@link reclaimTmp}다.
 * {@link STALE_PROFILE_MS}(90초)를 걸면 방금 생긴 덤프는 언제나 건너뛰어지고, 90초가
 * 지나기 전에 다음 패스가 launch 전 측정에서 거절된다 — 08-29의 간격이 43초·33초였다.
 * 근거를 따로 만들 필요도 없다: 코어 덤프는 **이미 죽은 프로세스의 시체 사진**이라,
 * 잔해 중 유일하게 "아직 쓰는 중인 주인"이 존재할 수 없는 종류다. `playwright_*`가
 * 커널에게 묻고 나머지가 시계에게 묻는다면, 이건 물을 상대가 아예 없다.
 *
 * 옆 크롤의 브라우저가 지금 죽는 중이라 커널이 쓰고 있는 파일이면? 지워도 된다.
 * POSIX unlink는 그 쓰기를 방해하지 않는다 — 커널은 열린 inode에 계속 쓰고 공간은
 * 쓰기가 끝나면 반납된다. 잃는 건 그 순간 회수했다고 믿은 숫자뿐이고(그만큼은 잠시
 * `unaccountedMb`로 간다), 얻는 건 인스턴스가 죽을 때까지 고정될 300MB가 **쓰기가
 * 끝나는 순간까지만** 잡히는 것이다. 어차피 이 덤프를 읽는 사람은 없다 — Vercel
 * Hobby에서 파일을 꺼낼 방법도 없다.
 *
 * ⚠️ 이름 규칙이 좁은 것도 의도다. 끝이 pid(숫자)여야 하고 `stat`이 파일이어야 한다
 * (판정은 {@link sweepStaleProfiles}에 있다). `/tmp/core` 디렉터리나 `core.notes.txt`
 * 같은 것은 걸리지 않고, `/tmp/chromium`·`/tmp/chromium-pack`은 이 이름과 애초에
 * 무관하다 — 위 목록의 ⚠️와 같은 약속이다.
 */
const CORE_DUMP_NAME = /^core\.(?:.+\.)?\d+$/;

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
): Promise<SweepResult> {
  await dropExtractedPack(log);
  // Before the profile sweep, not after: a browser that is still running holds
  // its profile in `/proc`, and the sweep will correctly refuse to touch it.
  // Ending the process is what makes the directory sweepable at all.
  await reapOrphanBrowsers(log);
  return sweepStaleProfiles(log);
}

/**
 * 한 번의 회수가 무엇을 지웠는가. `cores`를 따로 세는 이유는 Hobby가 런타임 로그를
 * 보관하지 않아서다 — 이 숫자가 `crawl_logs`까지 가야 08-29의 래칫이 끊겼다는 것을
 * 반나절 뒤에도 읽을 수 있다(`run.ts`의 `buildResourceNote`).
 */
export type SweepResult = { removed: number; cores: number; coreMb: number };

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
 * ⚠️ 2026-08-29 정정: 그 "건너뜀"은 {@link profilesInUse}가 크로미움의 cmdline을 읽지
 * 못해 **한 번도 일어나지 않았다.** 디렉터리는 오히려 지워지고 있었고(살아 있는
 * 브라우저의 것까지), 실제로 인스턴스를 마르게 한 것은 그 프로세스의 RSS와 unlink된
 * fd였다. 파싱은 고쳤으니 이제 이 문단은 사실이다 — 그리고 사실이 된 만큼 이 함수가
 * 더 필요해졌다.
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
 *
 * 판정자는 셋이고 {@link debrisPolicy}가 고른다. 세 번째(코어 덤프)는 나이도 커널도
 * 묻지 않는데, 그 이유가 {@link CORE_DUMP_NAME}에 적혀 있다.
 */
/**
 * 잔해 하나를 누구에게 물어 판정하는가.
 *
 *   `kernel`        — `/proc`에게. `playwright_*`만이 `--user-data-dir`이고, 살아
 *                     있는 프로세스가 그 경로를 이름 대고 있으면 우리 것이 아니다.
 *   `unconditional` — 아무에게도. {@link CORE_DUMP_NAME} 참조 — 시체에는 주인이 없다.
 *   `age`           — 시계에게. 이름을 대는 프로세스가 없어 `/proc`이 어느 쪽으로도
 *                     보증해줄 수 없는 나머지.
 *
 * 세 판정자를 여기서 한 번에 이름 붙여 두면 sweep 루프에 분기별 주석이 필요 없다.
 */
function debrisPolicy(name: string): "kernel" | "unconditional" | "age" | null {
  if (CORE_DUMP_NAME.test(name)) return "unconditional";
  if (name.startsWith("playwright_")) return "kernel";
  return TMP_DEBRIS_PREFIXES.some((p) => name.startsWith(p)) ? "age" : null;
}

async function sweepStaleProfiles(
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<SweepResult> {
  const dir = tmpdir();
  const inUse = await profilesInUse();
  let removed = 0;
  let cores = 0;
  let coreBytes = 0;
  try {
    const entries = await readdir(dir);
    const cutoff = Date.now() - STALE_PROFILE_MS;
    for (const name of entries) {
      const policy = debrisPolicy(name);
      if (!policy) continue;
      const path = join(dir, name);
      try {
        // `/proc`을 못 읽으면 커널에게 물을 수가 없으니 시계로 내려간다(종전 동작
        // 그대로). `unconditional`은 물을 상대가 없으므로 이 강등과 무관하다.
        const judge = policy === "kernel" && inUse === null ? "age" : policy;
        if (judge === "kernel") {
          if (inUse!.has(path)) continue;
        } else if (judge === "unconditional") {
          const info = await stat(path);
          // 덤프는 파일이다. 이름만 닮은 디렉터리는 우리가 만든 것이 아니다.
          if (!info.isFile()) continue;
          coreBytes += info.size;
          cores++;
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
  const coreMb = Math.round(coreBytes / 1024 / 1024);
  // `removed`는 이제 코어 덤프도 센다 — 옛 로그와 새 로그를 나란히 읽는 사람이
  // 여기서 오해한다. 코어는 따로도 세어 두는데, 그것이 08-29를 고쳤다는 증거다.
  if (removed > 0) {
    log("[browser] swept stale profiles", {
      removed,
      ...(cores > 0 ? { cores, coreMb } : {}),
    });
  }
  return { removed, cores, coreMb };
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
      // NUL **과 공백 둘 다**로 자른다. `/proc/<pid>/cmdline`은 NUL 구분이 규약이고
      // bash 같은 평범한 프로세스는 그렇게 나오지만, **크로미움은 자기 argv를 하나의
      // 공백 연결 문자열로 덮어쓴다**(리눅스에서 프로세스 타이틀을 바꾸는 그 방식).
      // 그러면 `split("\0")`의 원소는 실행 파일 경로로 시작하는 덩어리 하나뿐이라
      // `startsWith("--user-data-dir=")`가 **영원히 거짓**이 된다.
      //
      // 2026-08-29에 실측으로 드러났다 — 살아 있는 브라우저의 프로필이 `/proc`에
      // 멀쩡히 이름을 대고 있는데도 이 맵이 비어 있었다. 대가가 둘이고 둘 다 조용하다:
      //   · `sweepStaleProfiles`가 **살아 있는 프로필을 지운다**(테스트에서 재현).
      //     삭제된 디렉터리 위에서 크로미움은 열린 fd로 한동안 버티다 이상하게
      //     망가지고, 증상은 사이트 탓처럼 읽힌다.
      //   · `reapAbandoned`가 pid를 못 찾아 "혼자 끝났다"로 판정하고 **SIGKILL 없이**
      //     `reaped: true`를 신고한다. 08-27이 만든 회수 장치가 무동작이면서 성공을
      //     보고하고 있었다는 뜻이다.
      // 프로필 경로에는 공백이 없으므로(`/tmp/playwright_*`) 공백으로 잘라도 안전하다.
      for (const arg of argv.split(/[\0\s]+/)) {
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
 * 이 커널이 코어 덤프를 어디에 얼마나 크게 쓰도록 돼 있는가.
 *
 * 08-29에 `/tmp`를 채운 것이 코어 덤프였고, {@link CORE_DUMP_NAME}의 sweep은 그것을
 * 회수는 하지만 **애초에 안 생기게 하지는 못한다**. 막는 레버는 셋 다 우리 손 밖이다 —
 * Node에는 `setrlimit` 바인딩이 없고, `core_pattern`은 `/proc/sys`라 샌드박스에서
 * 쓸 수 없으며, `chromium.launch()`는 `cwd`를 노출하지 않아 상대 경로 패턴을 `/tmp`
 * 밖으로 돌릴 수도 없다. 그래서 여기서는 **레버의 위치만 기록해 둔다**: 스윕만으로
 * 부족하다는 것이 드러나면, 다음 수는 `PACK_ARG_GROUPS.isolation`을 떼는
 * (이미 준비돼 있는) 측정된 실험이다.
 *
 * 자리가 low-`/tmp` 분기 안인 것도 의도다. 건강한 실행에는 비용이 0이고, 곤란한
 * 실행에서는 이 두 값이 진단의 절반이다. 그리고 **Hobby에서 런타임 로그는 안 남고
 * 에러 메시지는 남으므로** 값이 있으면 `TmpExhaustedError` 문장에도 실린다 —
 * 08-29에 범인의 이름을 안 것도 정확히 그 비대칭 덕이었다.
 *
 * 어느 한 줄이라도 못 읽으면 조용히 비운다. 진단이 진단을 실패시켜서는 안 된다.
 */
async function coreDumpPolicy(): Promise<{ corePattern?: string; coreLimit?: string }> {
  const out: { corePattern?: string; coreLimit?: string } = {};
  try {
    out.corePattern = (await readFile("/proc/sys/kernel/core_pattern", "utf8")).trim();
  } catch {
    // 리눅스가 아니거나 읽을 수 없다 — 그 자체가 이 진단이 무의미한 환경이라는 뜻이다.
  }
  try {
    const line = (await readFile("/proc/self/limits", "utf8"))
      .split("\n")
      .find((l) => l.startsWith("Max core file size"));
    // "Max core file size   0   unlimited   bytes" — 첫 숫자 칸이 soft limit이고,
    // 그것이 0이면 커널은 덤프를 아예 쓰지 않는다(로컬 WSL이 그렇다).
    if (line) out.coreLimit = line.slice("Max core file size".length).trim().split(/\s+/)[0];
  } catch {
    // 같은 이유로 조용히.
  }
  return out;
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
 * ⚠️ 2026-08-29 정정: 08-27에는 저 건너뜀이 실제로 일어난다고 믿었지만
 * {@link profilesInUse}가 빈 답을 내고 있었다 — 즉 그 시절의 `reaped: true`는
 * **SIGKILL 없이** 나온 값이다(pid를 못 찾아 "혼자 끝났다"로 판정했다). 파싱을 고친
 * 지금에야 아래 `reapAbandoned`가 08-27이 쓴 대로 동작한다. 래칫이 있었다는 결론은
 * 그대로다 — 붙잡고 있던 것이 디렉터리가 아니라 프로세스였을 뿐이다.
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
): Promise<{ abandoned: boolean; reaped: boolean } & SweepResult> {
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
  const swept = await reclaimTmp(log);
  log("[browser] resources after teardown", await resourceSnapshot());
  return { abandoned: !closed, reaped, ...swept };
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
