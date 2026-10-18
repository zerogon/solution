import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import type { BrowserContext, Page } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

/**
 * Site exploration helper for building the KENSINGTON crawler (Phase F).
 *
 * A copy in spirit of `debug-resom.ts` rather than a generalization: each
 * file's steps are the narrative of one investigation and stay the tool for
 * that resort's regressions later.
 *
 * What is already known (2026-10-18, before any login):
 * - Login is the **무기명(법인) 회원** form at `/member/login_corp/`, not the
 *   regular member login. `login_corp.js` posts `#frm_corp`
 *   (`corp_id`/`corp_pw`) to `/proc/login_corp_result` and reads JSON
 *   `{com_yn:"Y", ret_url}`; 403 is a distinct failure ("회원관리팀 문의").
 * - Property list: `GET /reservation/json_branch_list` (public, 22 rows).
 * - Rooms: `GET /reservation/quick_roomdata/?…` returns an HTML fragment, one
 *   `a.btn_roomsel[data-room-type-cd]` per room type with a "~최저가". It
 *   answers anonymously too — which is exactly why `member` exists: the
 *   question is whether the corporate identity changes the answer.
 * - Month close-out: `POST /reservation/quick_all_room_stock {branCd, yearMonth}`.
 *
 * Usage:
 *   npx tsx scripts/debug-kensington.ts <step> [args]
 *
 * Steps:
 *   branches                         public property list
 *   doLogin                          real corporate login, record network, save session
 *   whoami                           what the saved session looks like to the site
 *   rooms <branCd> <checkin> [n]     parsed room fragment (session if present)
 *   member [branCd] [checkin] [n]    anonymous vs corporate, same request
 *   plans <branCd> <checkin> <n> <room>  rate plans for one room, anonymous vs corporate
 *   membno                           memberships on the account and the branches each books
 *   mrooms <#membership> <branCd> <checkin> [n] [prime]   member room list (quick_roomdata_member)
 *   mstock <#membership> <branCd> <yyyymm>  member month close-out
 *   stock <branCd> <yyyymm>          month close-out dates (session if present)
 *   raw <path>                       GET any same-site path with the session, dump to file
 *
 * Credentials: `KENSINGTON_ID`/`KENSINGTON_PW` env if set, otherwise the
 * primary ResortAccount from the DB — the one `run.ts` uses. Only lengths are
 * printed. **No step retries a login** — this is a corporate account and
 * repeated failures risk a lock, so a survey should log in once.
 */
const OUT = process.env.DEBUG_OUT ?? "/tmp/kensington-debug";
const STATE_FILE = `${OUT}-state.json`;
const BASE = "https://www.kensington.co.kr";

/** Steps that are anonymous by design and must not pick up the saved session. */
const ANON_STEPS = new Set(["branches", "doLogin"]);

async function resolveCredentials(): Promise<{ id: string; pw: string }> {
  if (process.env.KENSINGTON_ID && process.env.KENSINGTON_PW) {
    return { id: process.env.KENSINGTON_ID, pw: process.env.KENSINGTON_PW };
  }
  const { prisma } = await import("../src/lib/prisma");
  const { decrypt } = await import("../src/lib/crypto");
  const resort = await prisma.resort.findUnique({ where: { slug: "KENSINGTON" } });
  if (!resort) throw new Error("KENSINGTON resort row missing");
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) throw new Error("No primary KENSINGTON ResortAccount (add one at /admin/accounts)");
  return { id: decrypt(account.idEncrypted), pw: decrypt(account.pwEncrypted) };
}

/** Membership numbers are the operator's own identifiers; keep them out of logs that get pasted around. */
function mask(v: string): string {
  return v.replace(/\d(?=\d{2})/g, "*");
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function roomQuery(branCd: string, checkin: string, nights: number): string {
  const q = new URLSearchParams({
    search_bran_cd: branCd,
    search_stay_start_dt: checkin,
    search_stay_end_dt: addDays(checkin, nights),
    search_room_cnt: "1",
    search_people_adult_cnt: "2",
    search_people_adult_cnts: "2",
    search_people_child_cnt: "0",
    search_people_child_cnts: "0",
    search_code_type: "",
    search_code: "",
    pack_cd: "",
    room_type_cd: "",
    pay_type: "P",
  });
  return `${BASE}/reservation/quick_roomdata/?${q}`;
}

interface ParsedRoom {
  code: string;
  name: string;
  price: number | null;
  classes: string;
  extra: string;
}

/** Parse the room fragment in the page (DOM, not regex) and report every distinguishing class. */
async function parseRooms(page: Page, html: string): Promise<ParsedRoom[]> {
  return page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, "text/html");
    return [...doc.querySelectorAll("[data-room-type-cd]")]
      .filter((a) => a.classList.contains("btn_roomsel") || a.tagName === "A")
      .map((a) => {
        const item = a.closest(".item");
        const priceAttr = a.querySelector("[data-kfx-price]")?.getAttribute("data-kfx-price");
        return {
          code: a.getAttribute("data-room-type-cd") ?? "",
          name: a.querySelector(".title span")?.textContent?.trim() ?? "",
          price: priceAttr ? Number(priceAttr) : null,
          classes: `${item?.className ?? ""} | ${a.className}`,
          extra: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        };
      });
  }, html);
}

async function fetchRooms(ctx: BrowserContext, branCd: string, checkin: string, nights: number) {
  const res = await ctx.request.get(roomQuery(branCd, checkin, nights), {
    headers: { Referer: `${BASE}/reservation/quick`, "X-Requested-With": "XMLHttpRequest" },
    timeout: 20_000,
  });
  return { status: res.status(), url: res.url(), html: await res.text() };
}

function printRooms(label: string, rooms: ParsedRoom[]) {
  console.log(`\n[${label}] ${rooms.length} room types`);
  for (const r of rooms) {
    console.log(
      `  ${r.code.padEnd(8)} ${String(r.price ?? "-").padStart(8)}  ${r.name}   {${r.classes}}`,
    );
  }
}

async function main() {
  const step = process.argv[2] ?? "branches";
  const args = process.argv.slice(3);
  const useState = !ANON_STEPS.has(step) && existsSync(STATE_FILE);
  const saved = useState ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
  if (ANON_STEPS.has(step)) console.log("[state] anonymous by design");
  else if (saved) {
    const ageMin = Math.round((Date.now() - statSync(STATE_FILE).mtimeMs) / 60_000);
    console.log(`[state] reusing ${STATE_FILE} age=${ageMin}m`);
  } else console.log("[state] no saved session — anonymous");

  const browser = await launchBrowser();
  const context = await newContextFromState(browser, saved);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });

  try {
    if (step === "branches") {
      const res = await context.request.get(`${BASE}/reservation/json_branch_list`);
      const json = (await res.json()) as { row: Array<Record<string, string>> };
      for (const r of json.row) {
        console.log(
          `${r.BSNS_SECT_CD} ${r.BRAN_CD.padEnd(6)} ${r.BRAN_NM.padEnd(24)} ${r.BRAN_ADDRESS1 ?? ""}`,
        );
      }
    } else if (step === "doLogin") {
      const cred = await resolveCredentials();
      console.log(`[cred] id len=${cred.id.length} pw len=${cred.pw.length}`);
      const hops: string[] = [];
      page.on("response", (r) => {
        const t = r.request().resourceType();
        if (t === "document" || t === "xhr" || t === "fetch") {
          hops.push(`${r.status()} ${r.request().method()} ${r.url()}`);
        }
      });
      await page.goto(`${BASE}/member/login_corp/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator("#corp_id").fill(cred.id);
      await page.locator("#corp_pw").fill(cred.pw);
      // Same request the form handler sends (`$("#frm_corp").serialize()` →
      // POST), issued from the page so cookies/Referer are the browser's. Not
      // via `login_corp()` itself: on success it navigates away before the
      // response body can be read (observed 2026-10-18).
      const { status, body } = await page.evaluate(async () => {
        const form = document.querySelector<HTMLFormElement>("#frm_corp")!;
        const data = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
        const r = await fetch("/proc/login_corp_result", {
          method: "POST",
          body: data,
          headers: { "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
        });
        return { status: r.status, body: await r.text() };
      });
      const res = { status: () => status };
      let parsed: { com_yn?: string; ret_url?: string } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        /* not JSON */
      }
      if (parsed.com_yn === "Y" && parsed.ret_url) {
        await page.goto(new URL(parsed.ret_url, BASE).toString(), { waitUntil: "domcontentloaded" });
      }
      console.log(`[login] status=${res.status()} com_yn=${parsed.com_yn} ret_url=${parsed.ret_url}`);
      console.log(`[login] response keys=${Object.keys(parsed).join(",")} len=${body.length}`);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(3_000);
      console.log(`[after] url=${page.url()}`);
      console.log("[hops]\n  " + hops.join("\n  "));
      const cookies = await context.cookies(BASE);
      console.log("[cookies]", cookies.map((c) => `${c.name}(${c.domain},len=${c.value.length})`).join(" "));
      await page.screenshot({ path: `${OUT}-after-login.png` });
      if (parsed.com_yn === "Y") {
        writeFileSync(STATE_FILE, JSON.stringify(await context.storageState()));
        console.log(`[saved] ${STATE_FILE}`);
      } else {
        console.log("[not saved] login did not succeed — NOT retrying (account lock risk)");
      }
    } else if (step === "whoami") {
      for (const path of ["/", "/reservation/quick", "/myreservation/reservation_search"]) {
        const res = await context.request.get(`${BASE}${path}`);
        const html = await res.text();
        const file = `${OUT}-whoami${path.replace(/\//g, "_") || "_root"}.html`;
        writeFileSync(file, html);
        const marks = ["goto_logout", "로그아웃", "로그인", "login_corp", "corp", "무기명", "법인"]
          .map((m) => `${m}=${html.split(m).length - 1}`)
          .join(" ");
        console.log(`${res.status()} ${path.padEnd(36)} ${res.url()}  ${marks}  → ${file}`);
      }
    } else if (step === "rooms") {
      const [branCd = "RKT01", checkin = addDays(new Date().toISOString().slice(0, 10), 14), n = "1"] = args;
      const r = await fetchRooms(context, branCd, checkin, Number(n));
      writeFileSync(`${OUT}-rooms.html`, r.html);
      console.log(`${r.status} ${r.url} len=${r.html.length} → ${OUT}-rooms.html`);
      printRooms(saved ? "session" : "anonymous", await parseRooms(page, r.html));
    } else if (step === "member") {
      if (!saved) {
        console.log("No saved session — skipping: anon↔anon would read as 'login changes nothing'.");
        return;
      }
      const [branCd = "RKT01", checkin = addDays(new Date().toISOString().slice(0, 10), 14), n = "1"] = args;
      const anonCtx = await newContextFromState(browser, null);
      const a = await fetchRooms(anonCtx, branCd, checkin, Number(n));
      const s = await fetchRooms(context, branCd, checkin, Number(n));
      writeFileSync(`${OUT}-member-anon.html`, a.html);
      writeFileSync(`${OUT}-member-corp.html`, s.html);
      const ar = await parseRooms(page, a.html);
      const sr = await parseRooms(page, s.html);
      printRooms("anonymous", ar);
      printRooms("corporate", sr);
      const am = new Map(ar.map((r) => [r.code, r]));
      const sm = new Map(sr.map((r) => [r.code, r]));
      console.log("\n[diff]");
      for (const code of new Set([...am.keys(), ...sm.keys()])) {
        const x = am.get(code);
        const y = sm.get(code);
        if (!x) console.log(`  + corp only  ${code} ${y?.name} ${y?.price}`);
        else if (!y) console.log(`  - anon only  ${code} ${x.name} ${x.price}`);
        else if (x.price !== y.price) console.log(`  ~ price      ${code} ${x.price} → ${y.price}`);
      }
      console.log(
        `[verdict] ${a.html === s.html ? "byte-identical — identity changes nothing on this call" : "responses differ"}`,
      );
      await anonCtx.close();
    } else if (step === "plans") {
      // Rate plans for one room type — what `.btn_roomsel` loads (step1 of the
      // booking flow). If the corporate identity shows up anywhere, it is here.
      const [branCd = "RKT01", checkin = addDays(new Date().toISOString().slice(0, 10), 14), n = "1", room = ""] = args;
      const url = roomQuery(branCd, checkin, Number(n))
        .replace("/quick_roomdata/", "/quick_roomdata_subpack/")
        .replace("room_type_cd=", `room_type_cd=${encodeURIComponent(room)}`);
      const headers = { Referer: `${BASE}/reservation/quick`, "X-Requested-With": "XMLHttpRequest" };
      const anonCtx = await newContextFromState(browser, null);
      const a = await (await anonCtx.request.get(url, { headers })).text();
      const s = await (await context.request.get(url, { headers })).text();
      writeFileSync(`${OUT}-plans-anon.html`, a);
      writeFileSync(`${OUT}-plans-corp.html`, s);
      const summarize = (html: string) =>
        page.evaluate((src) => {
          const doc = new DOMParser().parseFromString(src, "text/html");
          const attrs = [...doc.querySelectorAll("*")]
            .flatMap((e) => [...e.attributes].filter((x) => x.name.startsWith("data-")))
            .map((x) => `${x.name}=${x.value}`);
          const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
          return { attrs: [...new Set(attrs)].slice(0, 60), text: text.slice(0, 1200) };
        }, html);
      console.log("[anon]", a.length, JSON.stringify(await summarize(a), null, 1));
      console.log("[corp]", s.length, JSON.stringify(await summarize(s), null, 1));
      console.log(`[verdict] ${a === s ? "byte-identical" : "responses differ"}`);
      await anonCtx.close();
    } else if (step === "membno") {
      // Which 분양회원번호 the account holds, and which branches each one books.
      // The numbers come from the member page itself — they are never config.
      const page0 = await context.request.get(`${BASE}/reservation/quick_member`);
      const html = await page0.text();
      const pairs = [...html.matchAll(/membno_select\('([^']+)','([^']+)'\)/g)].map((m) => [m[1], m[2]]);
      console.log(`[membno] ${pairs.length} memberships`);
      for (const [short, full] of pairs) {
        const res = await context.request.post(`${BASE}/reservation/membno_select`, {
          form: { membNo: short },
          headers: { Referer: `${BASE}/reservation/quick_member`, "X-Requested-With": "XMLHttpRequest" },
        });
        const rows = (await res.json()) as Array<Record<string, string>>;
        console.log(`\n${mask(short)} (full ${mask(full)}) → ${res.status()} ${rows.length} rows; keys=${Object.keys(rows[0] ?? {}).join(",")}`);
        for (const r of rows) console.log(`  div=${r.resortDiv} ${r.branCd} ${r.branNm}`);
      }
    } else if (step === "mrooms") {
      // Member room list: what quick_member.js calls for a resort (R*/GKT01) branch.
      const [which = "1", branCd = "RKT01", checkin = addDays(new Date().toISOString().slice(0, 10), 14), n = "1", prime = ""] = args;
      // `which` is the membership's position on the member page (1-based), so
      // the numbers never have to be typed or echoed.
      const memberHtml = await (await context.request.get(`${BASE}/reservation/quick_member`)).text();
      const pairs = [...memberHtml.matchAll(/membno_select\('([^']+)','([^']+)'\)/g)];
      const picked = pairs[Number(which) - 1];
      if (!picked) throw new Error(`membership #${which} not found (${pairs.length} on page)`);
      const [, short, full] = picked;
      const headers = { Referer: `${BASE}/reservation/quick_member`, "X-Requested-With": "XMLHttpRequest" };
      if (prime) {
        // Replay the page's own selection calls in case the server keeps state.
        await context.request.get(`${BASE}/reservation/quick_member`);
        console.log("membno_select", (await context.request.post(`${BASE}/reservation/membno_select`, { form: { membNo: short }, headers })).status());
        console.log("branch_select", (await context.request.post(`${BASE}/reservation/branch_select`, { form: { branCd, membNo: short }, headers })).status());
      }
      const room = process.env.ROOM ?? "";
      const url = roomQuery(branCd, checkin, Number(n))
        .replace("/quick_roomdata/", room ? "/quick_roomdata_subpack_member/" : "/quick_roomdata_member/")
        .replace("room_type_cd=", `room_type_cd=${encodeURIComponent(room)}`)
        .replace("pay_type=P", `pay_type=D&memb_no=${encodeURIComponent(full)}`);
      const res = await context.request.get(url, { headers });
      const html = await res.text();
      writeFileSync(`${OUT}-mrooms.html`, html);
      console.log(`${res.status()} len=${html.length} → ${OUT}-mrooms.html`);
      printRooms(`member ${mask(full)} ${branCd} ${checkin}+${n}`, await parseRooms(page, html));
      if (html.trim().length < 300) console.log("[body]", html.trim());
    } else if (step === "occ" || step === "price") {
      // The crawler's own parsers (`kensington/parse.ts`) over the member room list:
      //   occ   <branCd> [checkin]            popup_room_info per room → 기준/최대 (anonymous calls)
      //   price <#> <branCd> <checkin> [n]    quick_set_summary per room → 총액 + 날짜별
      const { parseOccupancy, parseSummaryTotal } = await import("../src/crawlers/kensington/parse");
      const [a0, a1, a2, a3] = args;
      const which = step === "price" ? (a0 ?? "1") : "1";
      const branCd = (step === "price" ? a1 : a0) ?? "RKT01";
      const checkin = (step === "price" ? a2 : a1) ?? addDays(new Date().toISOString().slice(0, 10), 14);
      const n = Number(step === "price" ? (a3 ?? "1") : "1");
      const memberHtml = await (await context.request.get(`${BASE}/reservation/quick_member`)).text();
      const full = [...memberHtml.matchAll(/membno_select\('([^']+)','([^']+)'\)/g)][Number(which) - 1]?.[2];
      if (!full) throw new Error("no membership on quick_member — session expired? run doLogin");
      const headers = { Referer: `${BASE}/reservation/quick_member`, "X-Requested-With": "XMLHttpRequest" };
      const listUrl = roomQuery(branCd, checkin, n)
        .replace("/quick_roomdata/", "/quick_roomdata_member/")
        .replace("pay_type=P", `pay_type=D&memb_no=${encodeURIComponent(full)}`);
      const rooms = await parseRooms(page, await (await context.request.get(listUrl, { headers })).text());
      console.log(`[${step}] ${branCd} ${checkin}+${n} — ${rooms.length} rooms (member ${mask(full)})`);
      const nights = Array.from({ length: n }, (_, i) => addDays(checkin, i));
      for (const r of rooms) {
        if (step === "occ") {
          const res = await fetch(`${BASE}/reservation/popup_room_info`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
            body: new URLSearchParams({ bran_cd: branCd, room_type_cd: r.code }).toString(),
          });
          const html = await res.text();
          const raw = html.match(/desc_title">\s*인원\s*<\/span>\s*<span>([^<]*)</)?.[1] ?? "(no 인원 cell)";
          const occ = parseOccupancy(html);
          console.log(`  ${r.code.padEnd(8)} ${occ ? `${occ.standard}/${occ.max}`.padEnd(6) : "null  "} [${raw}]  ${r.name}`);
        } else {
          const url = listUrl
            .replace("/quick_roomdata_member/", "/quick_set_summary/")
            .replace("room_type_cd=", `room_type_cd=${encodeURIComponent(r.code)}`);
          const startedAt = Date.now();
          const html = await (await context.request.get(url, { headers })).text();
          const perNight = [...html.matchAll(/<span class="tit">\s*([\d. ]+\([^)]*\))\s*<\/span>\s*<span class="desc"[^>]*>[^<]*<span class="num">([^<]*)</g)]
            .map((m) => `${m[1].replace(/\s/g, "")} ${m[2]}`);
          const total = parseSummaryTotal(html, nights);
          console.log(`  ${r.code.padEnd(8)} ${String(total ?? "null").padStart(9)}  ${String(Date.now() - startedAt).padStart(5)}ms  [${perNight.join(" + ")}]  ${r.name}`);
        }
      }
    } else if (step === "mstock") {
      const [which = "1", branCd = "RKT01", ym = new Date().toISOString().slice(0, 7).replace("-", "")] = args;
      const memberHtml = await (await context.request.get(`${BASE}/reservation/quick_member`)).text();
      const short = [...memberHtml.matchAll(/membno_select\('([^']+)','([^']+)'\)/g)][Number(which) - 1]?.[1] ?? "";
      const res = await context.request.post(`${BASE}/reservation/quick_all_room_stock_member`, {
        form: { branCd, membNo: short, yearMonth: ym },
        headers: { Referer: `${BASE}/reservation/quick_member`, "X-Requested-With": "XMLHttpRequest" },
      });
      console.log(res.status(), await res.text());
    } else if (step === "stock") {
      const [branCd = "RKT01", ym = new Date().toISOString().slice(0, 7).replace("-", "")] = args;
      const res = await context.request.post(`${BASE}/reservation/quick_all_room_stock`, {
        form: { branCd, yearMonth: ym },
        headers: { Referer: `${BASE}/reservation/quick`, "X-Requested-With": "XMLHttpRequest" },
      });
      console.log(res.status(), await res.text());
    } else if (step === "raw") {
      const path = args[0] ?? "/";
      const res = await context.request.get(path.startsWith("http") ? path : `${BASE}${path}`);
      const file = `${OUT}-raw.html`;
      writeFileSync(file, await res.text());
      console.log(`${res.status()} ${res.url()} → ${file}`);
    } else {
      console.log(`unknown step: ${step}`);
    }
  } finally {
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
