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
 */
export async function launchBrowser(): Promise<Browser> {
  const packUrl = process.env.CHROMIUM_PACK_URL;
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
