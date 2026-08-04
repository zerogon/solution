import "dotenv/config";
import type { Page } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

// Site exploration helper for rewriting the Lotte crawler against
// lottehotel.com. Usage: npx tsx scripts/debug-page.ts <step> [url]
// Steps: main | login | resort | custom (custom just opens [url] and dumps)
const OUT = process.env.DEBUG_OUT ?? "/tmp/lotte-debug";

async function acceptCookies(page: Page) {
  try {
    await page.getByRole("button", { name: "전체 동의" }).click({ timeout: 5_000 });
    console.log("[cookies] accepted");
    await page.waitForTimeout(1_000);
  } catch {
    console.log("[cookies] banner absent");
  }
}

async function dump(page: Page, label: string) {
  console.log(`\n--- ${label} ---`);
  console.log("url:", page.url());
  console.log("title:", await page.title());
  await page.screenshot({ path: `${OUT}-${label}.png`, fullPage: false });
  console.log(`screenshot: ${OUT}-${label}.png`);
}

async function dumpInputs(page: Page) {
  const inputs = await page.locator("input").evaluateAll((els) =>
    els.map((e) => ({
      type: e.getAttribute("type"),
      name: e.getAttribute("name"),
      id: e.getAttribute("id"),
      placeholder: e.getAttribute("placeholder"),
      ariaLabel: e.getAttribute("aria-label"),
      visible: (e as HTMLElement).offsetParent !== null,
    })),
  );
  console.log("inputs:", JSON.stringify(inputs.filter((i) => i.type !== "hidden"), null, 2));
}

async function dumpLinks(page: Page, containerSel: string, label: string) {
  const links = await page.locator(`${containerSel} a`).evaluateAll((els) =>
    els
      .map((e) => ({
        text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
        href: e.getAttribute("href"),
      }))
      .filter((l) => l.text || l.href),
  );
  console.log(`${label} links:`, JSON.stringify(links, null, 2));
}

async function main() {
  const step = process.argv[2] ?? "main";
  const url = process.argv[3];
  const browser = await launchBrowser();
  const context = await newContextFromState(browser, null);
  const page = await context.newPage();

  if (step === "main") {
    await page.goto("https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await dump(page, "main");
    await dumpLinks(page, "header", "header");
  } else if (step === "login") {
    await page.goto("https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByRole("link", { name: "로그인" }).first().click({ timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5_000);
    await dump(page, "login");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 30)));
    try {
      console.log("aria snapshot (form):");
      console.log(await page.locator("form").first().ariaSnapshot());
    } catch {
      console.log("(no form element)");
    }
  } else if (step === "resort") {
    await page.goto("https://www.lottehotel.com/resort-sokcho/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await dump(page, "resort");
    // Booking widget: dump anything that looks like the reservation panel
    const widgets = await page
      .locator("[class*='book'], [class*='reserv'], [id*='book'], [id*='reserv']")
      .evaluateAll((els) =>
        els.slice(0, 10).map((e) => ({
          tag: e.tagName,
          id: e.id,
          cls: e.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
        })),
      );
    console.log("booking-ish elements:", JSON.stringify(widgets, null, 2));
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 40)));
  } else if (step === "search") {
    await page.goto("https://www.lottehotel.com/resort-sokcho/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByRole("button", { name: "검색" }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(10_000);
    await dump(page, "search-result");
    // Where did we land? Dump result-page structure hints.
    const cards = await page
      .locator("[class*='room'], [class*='rate'], [class*='result']")
      .evaluateAll((els) =>
        els.slice(0, 15).map((e) => ({
          tag: e.tagName,
          cls: e.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 150),
        })),
      );
    console.log("result elements:", JSON.stringify(cards, null, 2));
  } else if (step === "bizcds") {
    // Direct URL navigation (no id= token) — does the room list still render?
    const direct =
      "https://resort.lottehotel.com/main/ko/reservation/accommodation" +
      "?bizCd=81&checkinDt=20260801&checkoutDt=20260802&roomCnt=1&reservationType=BAR";
    await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(10_000);
    await acceptCookies(page);
    await dump(page, "direct");
    const cardTitles = await page
      .locator("[class*='room-item'], [class*='card'], li")
      .evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " "))
          .filter((t) => /디럭스|스위트|호텔|콘도|패밀리/.test(t) && t.length < 120)
          .slice(0, 10),
      );
    console.log("room-ish texts:", JSON.stringify(cardTitles, null, 2));

    // Room card DOM structure (for parse.ts)
    const cardDom = await page
      .locator("[class*='room'] h1, [class*='room'] h2, [class*='room'] h3, [class*='room'] h4, [class*='room'] strong")
      .evaluateAll((els) =>
        els.slice(0, 12).map((e) => ({
          tag: e.tagName,
          cls: e.className?.toString().slice(0, 80),
          parentCls: e.parentElement?.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        })),
      );
    console.log("room title candidates:", JSON.stringify(cardDom, null, 2));

    // Open the property selector: click the panel row showing the current property
    try {
      await page.getByText("롯데리조트 속초", { exact: false }).last().click({ timeout: 5_000 });
      await page.waitForTimeout(3_000);
      await dump(page, "property-modal");
      const options = await page
        .locator("a, button, li, label, [data-biz-cd], [data-bizcd]")
        .evaluateAll((els) =>
          els
            .map((e) => ({
              tag: e.tagName,
              text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
              attrs: Object.fromEntries(
                Array.from(e.attributes)
                  .filter(
                    (a) =>
                      a.name.startsWith("data-") ||
                      ["value", "href", "id", "class"].includes(a.name),
                  )
                  .map((a) => [a.name, a.value.slice(0, 100)]),
              ),
            }))
            .filter((o) => /롯데리조트|속초|부여|제주|김해|산정/.test(o.text) && o.text.length < 60),
        );
      console.log("property options:", JSON.stringify(options, null, 2));
    } catch (e) {
      console.log("property selector open failed:", e instanceof Error ? e.message : e);
    }
  } else if (step === "dom") {
    const apiCalls: string[] = [];
    page.on("response", (res) => {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("json") && !res.url().includes("google") && !res.url().includes("facebook")) {
        apiCalls.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 180)}`);
      }
    });
    const direct =
      "https://resort.lottehotel.com/main/ko/reservation/accommodation" +
      "?bizCd=81&checkinDt=20260801&checkoutDt=20260802&roomCnt=1&reservationType=BAR";
    await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(12_000);
    console.log("json api calls:\n" + apiCalls.join("\n"));

    // Walk up from a room-title text node to its card container and dump HTML
    const cardHtml = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const t = node.textContent?.trim() ?? "";
        if (/^호텔 디럭스|^콘도 디럭스/.test(t)) {
          let el = node.parentElement;
          for (let i = 0; i < 6 && el; i++) {
            if (el.className && /item|card|list|room/i.test(el.className.toString())) break;
            el = el.parentElement;
          }
          return {
            titleTag: node.parentElement?.tagName,
            titleCls: node.parentElement?.className?.toString(),
            containerCls: el?.className?.toString(),
            html: (el?.outerHTML ?? "").slice(0, 4000),
          };
        }
      }
      return null;
    });
    console.log("card structure:", JSON.stringify(cardHtml, null, 2));
  } else if (step === "lpoint") {
    await page.goto("https://www.lottehotel.com/global/ko/login/rewards", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByText("L.POINT 로그인", { exact: false }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(5_000);
    await dump(page, "lpoint");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 20)));
    // iframe? L.POINT SSO often embeds or redirects
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 120)));
  } else if (step === "roomlist") {
    // Exercise performSearch + parseRoomList without login (API is public for
    // BAR rates) — validates the post-login pipeline end-to-end.
    const { performSearch } = await import("../src/crawlers/lotte/search");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const ctx = {
      resortId: "debug",
      slug: "lotte",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
    };
    const rows = await performSearch(ctx, { checkin, checkout: addDaysUtc(checkin, 1) });
    console.log(`rows: ${rows.length}`);
    console.log(JSON.stringify(rows.slice(0, 6), null, 2));
    const byBranch: Record<string, number> = {};
    for (const r of rows) byBranch[r.branchName] = (byBranch[r.branchName] ?? 0) + 1;
    console.log("per branch:", byBranch);
  } else {
    await page.goto(url ?? "https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(6_000);
    await acceptCookies(page);
    await dump(page, "custom");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 40)));
    await dumpLinks(page, "main", "main");
  }

  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
