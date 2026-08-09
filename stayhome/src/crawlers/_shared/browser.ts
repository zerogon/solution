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
export async function launchBrowser(): Promise<Browser> {
  const packUrl = process.env.CHROMIUM_PACK_URL;
  if (!packUrl && process.env.VERCEL) {
    throw new Error(
      "CHROMIUM_PACK_URL이 비어 있다. Vercel에는 시스템 크로미움이 없으므로 " +
        "@sparticuz/chromium-min 팩 URL이 반드시 필요하다 " +
        "(버전은 playwright-core의 browsers.json과 맞출 것).",
    );
  }
  if (packUrl) {
    // Production / Vercel: always headless (no display available)
    const chromiumMin = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await chromiumMin.executablePath(packUrl);
    return chromium.launch({
      args: chromiumMin.args,
      executablePath,
      headless: true,
    });
  }
  // Local dev: respect CRAWLER_HEADLESS env so we can watch the browser
  // while debugging selectors. Default is headless to match production.
  const headless = process.env.CRAWLER_HEADLESS !== "false";
  return chromium.launch({ headless });
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
