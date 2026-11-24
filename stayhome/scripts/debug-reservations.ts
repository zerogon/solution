import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Request, Response } from "playwright-core";

/**
 * 예약내역 엔드포인트 조사 도구 — **값을 가리고 모양만** 남긴다.
 *
 * `/mail`이 리조트에서 예약정보를 직접 가져오려면(`fetchReservations`) 리조트마다
 * "예약내역 화면이 어떤 주소를 부르고 무엇을 돌려주는가"를 먼저 알아야 한다. 그런데 그
 * 응답에는 구성원 이름·연락처가 들어 있어 원문을 로그나 대화에 남길 수 없다. 그래서 이
 * 도구는 네트워크를 기록하되 **키 이름과 자료형, 글자 종류만** 적는다.
 *
 *   npx tsx scripts/debug-reservations.ts selftest             # 가림 규칙 확인 (네트워크 없음)
 *   npx tsx scripts/debug-reservations.ts HANWHA               # 예약내역 화면을 열고 기록
 *   CRAWLER_HEADLESS=false npx tsx scripts/debug-reservations.ts SONO --wait=120
 *       # 창을 띄워 두고 120초 동안 **직접 클릭**해서 예약내역 → 예약 상세까지 들어간다.
 *       # 그동안 지나간 요청이 전부 기록된다. 시작 주소를 모르는 리조트는 이 방법을 쓴다.
 *
 * 옵션
 *   --url=<주소>     로그인 뒤 처음 열 주소 (기본: 아래 `START_URL`)
 *   --wait=<초>      열어 둔 채 기다리는 시간 (기본: 창이 보이면 120, 아니면 8)
 *   --show=K1,K2     값을 가리지 않을 키 (기본: INTF_ID). **개인정보가 아닌 키만** 넣을 것.
 *   --all            예약과 무관해 보이는 요청도 전부 적는다
 *   --out=<폴더>     결과 파일을 둘 곳 (기본: 임시 폴더)
 *
 * ## 가림 규칙
 *
 * - 문자열: 숫자→`9`, 한글→`가`, 영문→`a`/`A`. 구두점은 남긴다 — `"2026-12-03"`은
 *   `"9999-99-99"`, 전화번호는 `"999-9999-9999"`로 보여 **형식은 읽히고 내용은 없다**.
 * - 숫자: 자릿수만 (`<num:6>`). 불리언·null은 그대로.
 * - 배열: 길이와 첫 원소들의 합쳐진 모양만.
 * - 키 이름은 남긴다(스키마다). 단 숫자만으로 된 키는 값일 수 있어 가린다.
 * - 주소: 경로는 남기고 숫자 조각과 쿼리 값은 가린다.
 * - HTML 문서: 제목 칸(`th`·`dt`·`label`)의 글자와 입력 칸 이름만. 본문 값은 읽지 않는다.
 *
 * ⚠️ 그래도 **붙여넣기 전에 결과 파일을 한 번 훑어볼 것.** 리조트가 값을 키 자리에 넣는
 * 식의 예상 밖 구조에서는 이 규칙이 새는 곳이 있을 수 있다.
 *
 * 로그인은 저장된 세션을 먼저 쓰고, 만료됐을 때만 실제 로그인을 한다(그 경우 `run.ts`처럼
 * 새 세션을 저장한다). 읽기 전용이다 — 이 도구는 어떤 버튼도 누르지 않는다.
 */

// ───────────────────────── 가림 ─────────────────────────

const DEFAULT_SHOW = ["INTF_ID"];
const MAX_STRING = 48;
const MAX_DEPTH = 8;
const ARRAY_SAMPLE = 5;

export function maskString(s: string): string {
  const masked = s
    .replace(/[0-9]/g, "9")
    .replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, "가")
    .replace(/[a-z]/g, "a")
    .replace(/[A-Z]/g, "A");
  return masked.length > MAX_STRING
    ? `${masked.slice(0, MAX_STRING)}…(${masked.length}자)`
    : masked;
}

function tryJson(s: string): unknown | undefined {
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** 값 → 모양. `show`에 든 키의 값만 원문으로 남는다. */
export function shapeOf(value: unknown, show: ReadonlySet<string>, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return `<num:${String(Math.abs(Math.trunc(value))).length}>`;
  if (typeof value === "string") {
    // 문자열 안에 JSON이 들어 있는 사이트가 있다 (한화의 `ds`).
    const inner = tryJson(value);
    if (inner !== undefined && depth < MAX_DEPTH) return { "<json 문자열>": shapeOf(inner, show, depth + 1) };
    return maskString(value);
  }
  if (depth >= MAX_DEPTH) return "<…>";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const sample = value.slice(0, ARRAY_SAMPLE).map((v) => shapeOf(v, show, depth + 1));
    const objects = sample.filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v),
    );
    // 원소가 객체면 키를 합쳐 한 개로 보여준다 (원소마다 빠진 키가 다를 수 있다).
    const first = objects.length === sample.length ? Object.assign({}, ...objects) : sample[0];
    return [`<배열 ${value.length}개>`, first];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = /^\d+$/.test(k) || /[가-힣]/.test(k) ? `<키:${maskString(k)}>` : k;
      out[key] = show.has(k) && (typeof v === "string" || typeof v === "number") ? v : shapeOf(v, show, depth + 1);
    }
    return out;
  }
  return `<${typeof value}>`;
}

export function maskUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return maskString(raw);
  }
  const path = u.pathname
    .split("/")
    .map((seg) => (/\d{4,}/.test(seg) || /[가-힣%]/.test(seg) ? maskString(decodeSafe(seg)) : seg))
    .join("/");
  const query = [...u.searchParams.entries()].map(([k, v]) => `${k}=${maskString(v)}`).join("&");
  return `${u.origin}${path}${query ? `?${query}` : ""}`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 요청 본문 → 모양. JSON이면 그대로, 폼이면 칸 이름별로. */
export function shapeOfBody(body: string | null, show: ReadonlySet<string>): unknown {
  if (!body) return null;
  const json = tryJson(body);
  if (json !== undefined) return shapeOf(json, show);
  if (/^[^=&\s]+=/.test(body)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(body)) {
      out[k] = show.has(k) ? v : shapeOf(v, show, 1);
    }
    return out;
  }
  return maskString(body);
}

/** HTML 문서에서 **제목 글자와 입력 칸 이름만** 뽑는다. 값 칸(`td`)은 읽지 않는다. */
export function htmlOutline(html: string): { labels: string[]; inputs: string[]; scripts: string[] } {
  const text = (s: string) =>
    s
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const labels = new Set<string>();
  for (const m of html.matchAll(/<(th|dt|label)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    // 제목은 짧고 숫자가 없다. 길거나 숫자가 섞이면 값일 수 있으므로 가린다.
    const t = text(m[2]);
    if (!t || t.length > 20) continue;
    labels.add(/\d/.test(t) ? maskString(t) : t);
  }
  const inputs = new Set<string>();
  for (const m of html.matchAll(/<(?:input|select|textarea)\b[^>]*?\b(?:name|id)=["']([^"']+)["']/gi)) {
    inputs.add(m[1]);
  }
  // 페이지가 스스로 부르는 주소의 단서 (JSP·mvc 사이트).
  const scripts = new Set<string>();
  for (const m of html.matchAll(/["'](\/[\w\-./]+\.(?:mvc|do|pns|json|jsp)(?:\?[\w=&]*)?)["']/g)) {
    scripts.add(m[1].replace(/=[^&]*/g, "="));
  }
  for (const m of html.matchAll(/INTF_ID["']?\s*[:=]\s*["']([\w-]+)["']/g)) scripts.add(`INTF_ID=${m[1]}`);
  return {
    labels: [...labels].slice(0, 80),
    inputs: [...inputs].slice(0, 80),
    scripts: [...scripts].slice(0, 80),
  };
}

// ───────────────────────── 기록 ─────────────────────────

interface Entry {
  kind: "api" | "doc";
  method: string;
  url: string;
  status: number;
  request: unknown;
  response: unknown;
  relevant: boolean;
}

const RELEVANT =
  /예약|내역|resv|rsv|reserv|booking|history|mypage|my-?page|order|payment|결제|detail|msi|list/i;
const NOISE =
  /google|gtag|analytics|doubleclick|facebook|kakao|naver\.com|netfunnel|criteo|hotjar|sentry|\.(?:js|css|png|jpe?g|gif|svg|woff2?|ico)(?:\?|$)/i;

function record(entries: Entry[], show: ReadonlySet<string>) {
  return async (res: Response) => {
    try {
      const req: Request = res.request();
      const type = req.resourceType();
      if (type !== "xhr" && type !== "fetch" && type !== "document") return;
      const url = res.url();
      if (NOISE.test(url)) return;

      const ctype = (res.headers()["content-type"] ?? "").toLowerCase();
      const body = await res.text().catch(() => "");
      const json = tryJson(body);
      const post = req.postData();

      const entry: Entry = {
        kind: type === "document" ? "doc" : "api",
        method: req.method(),
        url: maskUrl(url),
        status: res.status(),
        request: shapeOfBody(post, show),
        response:
          json !== undefined
            ? shapeOf(json, show)
            : ctype.includes("html") || /^\s*</.test(body)
              ? htmlOutline(body)
              : body
                ? `<${ctype || "본문"} ${body.length}자>`
                : null,
        relevant: RELEVANT.test(url) || RELEVANT.test(post ?? ""),
      };
      // 같은 주소·같은 모양은 한 번만.
      const sig = JSON.stringify([entry.method, entry.url.split("?")[0], entry.request, entry.response]);
      if (!entries.some((e) => JSON.stringify([e.method, e.url.split("?")[0], e.request, e.response]) === sig)) {
        entries.push(entry);
        console.log(`  ${entry.relevant ? "●" : "·"} ${entry.method} ${entry.status} ${entry.url.slice(0, 110)}`);
      }
    } catch {
      // 창이 닫히는 중의 응답은 읽지 못한다. 기록에서 빠질 뿐이다.
    }
  };
}

/** 예약내역으로 가는 길을 찾는 단서 — 메뉴 링크의 글자와 주소. */
async function reservationLinks(page: Page): Promise<{ text: string; href: string }[]> {
  const links = await page
    .locator("a, button")
    .evaluateAll((els) =>
      els.map((e) => ({
        text: (e.textContent ?? "").trim().replace(/\s+/g, " "),
        href: e.getAttribute("href") ?? e.getAttribute("onclick") ?? "",
      })),
    )
    .catch(() => []);
  const seen = new Set<string>();
  return links
    .filter((l) => l.text.length > 0 && l.text.length <= 20 && /예약|내역|마이|조회|my/i.test(l.text + l.href))
    .map((l) => ({
      // 메뉴에 "○○○님" 같은 인사말이 섞이는 사이트가 있다.
      text: l.text.replace(/[가-힣]{2,5}\s*님/g, "○○님").replace(/\d/g, "9"),
      href: l.href.startsWith("http") ? maskUrl(l.href) : l.href.replace(/\d{4,}/g, (d) => "9".repeat(d.length)).slice(0, 120),
    }))
    .filter((l) => {
      const key = `${l.text}|${l.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

// ───────────────────────── 실행 ─────────────────────────

/** 로그인 뒤 처음 열 화면. 예약내역 주소를 아는 곳은 그 주소, 모르는 곳은 예약 첫 화면. */
const START_URL: Record<string, string> = {
  // 세션 부팅에 쓰는 화면이 곧 예약내역조회다 (`hanwha/config.ts`의 `entranceUrl`).
  HANWHA: "https://booking.hanwharesort.co.kr/rst/msi/0010/serviceM01.mvc",
  RESOM: "https://book.resom.co.kr/myPage",
  SONO: "https://www.sonohotelsresorts.com/reserve/room?step=sch",
  OAKVALLEY: "https://reservation.oakvalley.co.kr/frontoffice/p_entrance.jsp",
  LOTTE: "https://resort.lottehotel.com/main/ko/reservation/accommodation",
};

const SESSION_TTL_MS = 6 * 3600 * 1000;
const STEP_BUDGET_MS = 55_000;

function parseArgs(argv: string[]) {
  const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return {
    slug: argv.find((a) => !a.startsWith("--"))?.toUpperCase() ?? "",
    url: flag("url"),
    wait: flag("wait") ? Number(flag("wait")) : null,
    show: new Set([...DEFAULT_SHOW, ...(flag("show")?.split(",").filter(Boolean) ?? [])]),
    all: argv.includes("--all"),
    out: flag("out") ?? join(tmpdir(), "stayhome-reservations"),
  };
}

async function run(argv: string[]) {
  const args = parseArgs(argv);
  if (!(args.slug in START_URL)) {
    throw new Error(`리조트를 지정하세요: ${Object.keys(START_URL).join(" | ")}`);
  }

  // DB·크롤러는 여기서만 불러온다 — `selftest`는 `.env` 없이 돌아야 한다.
  const { prisma } = await import("@/lib/prisma");
  const { decrypt } = await import("@/lib/crypto");
  const { ResortSlug } = await import("@/generated/prisma/enums");
  const { closeBrowser, launchBrowser, newContextFromState } = await import("../src/crawlers/_shared/browser");
  const { loadStorageState, saveStorageState } = await import("../src/crawlers/_shared/session-store");
  const { withDeadline } = await import("../src/crawlers/_shared/timeout");
  const { loadCrawler } = await import("../src/crawlers/registry");

  const slug = args.slug as keyof typeof ResortSlug;
  const log = (msg: string, meta?: Record<string, unknown>) => console.log(`[${slug}] ${msg}`, meta ?? "");
  const headed = process.env.CRAWLER_HEADLESS === "false";
  const waitSec = args.wait ?? (headed ? 120 : 8);
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    const resort = await prisma.resort.findUnique({ where: { slug: ResortSlug[slug] } });
    if (!resort) throw new Error(`Resort row missing: ${slug}`);
    const account = await prisma.resortAccount.findFirst({
      where: { resortId: resort.id, isPrimary: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!account) throw new Error(`No primary ResortAccount for ${slug}. /admin/accounts에서 등록하세요.`);

    browser = await launchBrowser(log);
    const crawler = await loadCrawler(ResortSlug[slug]);
    const saved = await loadStorageState(resort.id);
    const context = await newContextFromState(browser, saved && !saved.expired ? saved.storageState : null);
    const page = await context.newPage();
    // 오크밸리 JSP는 native alert를 띄운다. 받아 주지 않으면 화면이 멈춘다.
    page.on("dialog", (d) => void d.dismiss().catch(() => undefined));

    const ctx = {
      resortId: resort.id,
      slug,
      context,
      page,
      credentials: {
        id: decrypt(account.idEncrypted),
        pw: decrypt(account.pwEncrypted),
        memo: account.memo ?? undefined,
      },
      log,
      deadlineAt: Date.now() + 10 * 60_000,
    };

    let loggedIn = saved && !saved.expired
      ? await withDeadline("validate", STEP_BUDGET_MS, () => crawler.validateSession(ctx)).catch(() => false)
      : false;
    log(loggedIn ? "저장된 세션 사용" : "저장된 세션 없음/만료 — 로그인합니다");
    if (!loggedIn) {
      await withDeadline("login", STEP_BUDGET_MS, () => crawler.login(ctx));
      loggedIn = await withDeadline("validate", STEP_BUDGET_MS, () => crawler.validateSession(ctx));
      if (!loggedIn) throw new Error("로그인 뒤에도 세션이 확인되지 않습니다");
      await saveStorageState(resort.id, context, SESSION_TTL_MS);
      log("새 세션 저장");
    }

    // 로그인 과정의 요청은 조사 대상이 아니다(자격증명이 지나간다). 여기서부터 기록한다.
    const entries: Entry[] = [];
    context.on("response", record(entries, args.show));

    const startUrl = args.url ?? START_URL[slug];
    console.log(`\n열기: ${maskUrl(startUrl)}`);
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    const links = await reservationLinks(page);

    if (headed) {
      console.log(
        `\n창에서 예약내역 → 예약 한 건의 상세까지 직접 들어가 보세요. ${waitSec}초 동안 기록합니다.` +
          "\n(예약을 바꾸거나 취소하는 버튼은 누르지 마세요.)",
      );
    }
    await page.waitForTimeout(waitSec * 1000);

    const shown = entries.filter((e) => args.all || e.relevant || e.kind === "doc");
    const report = [
      `# ${slug} 예약내역 조사 (값은 가려져 있음)`,
      "",
      `- 시작 주소: ${maskUrl(startUrl)}`,
      `- 마지막 주소: ${maskUrl(page.url())}`,
      `- 기록한 요청: ${entries.length}건 중 ${shown.length}건 표시${args.all ? "" : " (전부 보려면 --all)"}`,
      "",
      "## 예약 관련 메뉴 링크",
      "",
      ...(links.length ? links.map((l) => `- ${l.text} → \`${l.href}\``) : ["- (찾지 못함)"]),
      "",
      "## 요청",
      "",
      ...shown.flatMap((e) => [
        `### ${e.kind === "doc" ? "[문서]" : "[API]"} ${e.method} ${e.url}`,
        "",
        `status ${e.status}`,
        "",
        ...(e.request !== null ? ["요청 본문", "```json", JSON.stringify(e.request, null, 2), "```", ""] : []),
        e.kind === "doc" ? "문서 윤곽 (제목 글자 · 입력 칸 이름 · 스크립트 안의 주소)" : "응답 모양",
        "```json",
        JSON.stringify(e.response, null, 2),
        "```",
        "",
      ]),
    ].join("\n");

    mkdirSync(args.out, { recursive: true });
    const file = join(args.out, `${slug.toLowerCase()}.md`);
    writeFileSync(file, report);
    console.log(`\n결과 파일: ${file}`);
    console.log("붙여넣기 전에 한 번 훑어보세요 — 이름·전화번호·예약번호가 원문으로 보이면 안 됩니다.");
  } finally {
    if (browser) await closeBrowser(browser, log);
    await prisma.$disconnect();
  }
}

// ───────────────────────── 가림 규칙 확인 ─────────────────────────

function selftest() {
  const show = new Set(DEFAULT_SHOW);
  const secret = ["홍길동", "01012345678", "010-1234-5678", "hong@example.com", "R20261203", "서울시 강남구"];
  const payload = {
    resultCode: "0000",
    serviceInfo: { INTF_ID: "TFO00HBSRSVLST001" },
    data: {
      list: [
        { rsvNo: "R20261203", custNm: "홍길동", telNo: "010-1234-5678", ciYmd: "20261203", amt: 196000, useYn: true, memo: null },
        { rsvNo: "R20261210", custNm: "김철수", email: "hong@example.com", addr: "서울시 강남구" },
      ],
      byMember: { "11725700": { name: "홍길동" } },
    },
  };
  const out = [
    JSON.stringify(shapeOf(payload, show), null, 2),
    JSON.stringify(shapeOfBody(`ds=${encodeURIComponent(JSON.stringify({ serviceInfo: { INTF_ID: "X1" }, custNo: "01012345678" }))}&name=${encodeURIComponent("홍길동")}`, show), null, 2),
    maskUrl("https://example.com/api/reservation/01012345678/detail?custNm=홍길동&rsvNo=R20261203"),
    JSON.stringify(
      htmlOutline(
        '<table><tr><th>예약자명</th><td>홍길동</td><th>연락처</th><td>010-1234-5678</td></tr></table>' +
          '<label>홍길동 010-1234-5678 님의 예약</label><input name="rsvNo" value="R20261203">' +
          '<script>call("/rst/cmn/doExecute.mvc?custNo=01012345678"); var p={INTF_ID:"TFO00HBSRSVDTL002"};</script>',
      ),
      null,
      2,
    ),
  ].join("\n\n");
  console.log(out);

  const leaked = secret.filter((s) => out.includes(s));
  const kept = ["TFO00HBSRSVLST001", "rsvNo", "custNm", "예약자명", "/rst/cmn/doExecute.mvc", "TFO00HBSRSVDTL002"].filter(
    (s) => !out.includes(s),
  );
  console.log(leaked.length ? `\nFAIL 값이 새었다: ${leaked.join(", ")}` : "\nok   개인정보 값이 남지 않음");
  console.log(kept.length ? `FAIL 필요한 단서가 지워졌다: ${kept.join(", ")}` : "ok   키 이름 · INTF_ID · 주소 경로는 남음");
  process.exit(leaked.length || kept.length ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv[0] === "selftest") selftest();
else if (argv.length === 0) {
  console.log("usage: npx tsx scripts/debug-reservations.ts selftest | <HANWHA|SONO|RESOM|OAKVALLEY|LOTTE> [--url=] [--wait=] [--show=] [--all] [--out=]");
  process.exit(1);
} else {
  run(argv).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
