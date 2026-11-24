import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { ResortSlug } from "@/generated/prisma/enums";
import type { FetchedReservation } from "@/lib/mail/reservation";
import { closeBrowser, launchBrowser, newContextFromState } from "./_shared/browser";
import { clearStorageState, loadStorageState, saveStorageState } from "./_shared/session-store";
import { withDeadline } from "./_shared/timeout";
import { SessionLostError } from "./_shared/errors";
import { loadCrawler } from "./registry";
import type { CrawlerContext } from "./types";

/**
 * `/mail`의 "예약 불러오기" — 리조트 예약내역을 브라우저 한 벌로 읽어 온다.
 *
 * `run.ts`와 같은 세션 절차(저장된 세션 → 검증 → 필요하면 로그인 → 저장)를 밟지만
 * **재고를 쓰지 않고 `crawl_logs`도 남기지 않는다.** 이건 수집이 아니라 사람이 기다리는
 * 조회이고, 결과에 구성원 이름이 들어 있어 어디에도 남기면 안 된다.
 *
 * 자격증명 복호화는 `run.ts`와 같은 칸이다(CLAUDE.md 보안 규칙 2) — 평문은 이 프로세스의
 * Playwright 폼 입력으로 끝나고 호출자에게 돌아가지 않는다. 그래서 `REVEAL_CREDENTIAL`
 * 대상이 아니다.
 */

/** `name`은 사람이 입력한 이름 검색어 — 사이트가 이름으로 찾아 주는 곳(롯데)만 쓴다. */
export interface FetchOptions {
  name?: string;
}

type Fetcher = (ctx: CrawlerContext, opts: FetchOptions) => Promise<FetchedReservation[]>;

const FETCHERS: Partial<Record<ResortSlug, () => Promise<Fetcher>>> = {
  HANWHA: async () => (await import("./hanwha/reservations")).fetchReservations,
  RESOM: async () => (await import("./resom/reservations")).fetchReservations,
  SONO: async () => (await import("./sono/reservations")).fetchReservations,
  LOTTE: async () => (await import("./lotte/reservations")).fetchReservations,
  OAKVALLEY: async () => (await import("./oakvalley/reservations")).fetchReservations,
  KENSINGTON: async () => (await import("./kensington/reservations")).fetchReservations,
};

/** `run.ts`의 `DEFAULT_SESSION_TTL_HOURS`와 같은 값 — 같은 `resort_sessions` 행을 쓴다. */
const SESSION_TTL_MS = 6 * 3600 * 1000;
/** 라우트 `maxDuration`이 60초다. 브라우저 종료 몫을 남긴다. */
const BUDGET_MS = 50_000;

export function canFetch(slug: ResortSlug): boolean {
  return slug in FETCHERS;
}

export async function fetchResortReservations(
  slug: ResortSlug,
  opts: FetchOptions = {},
): Promise<FetchedReservation[]> {
  const loadFetcher = FETCHERS[slug];
  if (!loadFetcher) throw new Error(`예약 불러오기를 지원하지 않는 리조트: ${slug}`);

  const deadline = Date.now() + BUDGET_MS;
  const left = () => Math.max(1_000, deadline - Date.now());
  const log = (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[reservations ${slug}] ${msg}`, meta ?? "");

  const resort = await prisma.resort.findUnique({ where: { slug } });
  if (!resort) throw new Error(`Resort not found: ${slug}`);
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) throw new Error(`${resort.name} 계정이 없습니다. /admin/accounts에서 등록하세요.`);

  const [crawler, fetcher] = await Promise.all([loadCrawler(slug), loadFetcher()]);
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser(log);
    const cached = await loadStorageState(resort.id);
    const initialState = cached && !cached.expired ? cached.storageState : null;
    const context = await newContextFromState(browser, initialState);
    const page = await context.newPage();

    const ctx: CrawlerContext = {
      resortId: resort.id,
      slug,
      context,
      page,
      credentials: {
        id: decrypt(account.idEncrypted),
        pw: decrypt(account.pwEncrypted),
        // 평문 컬럼 — 한화 회원권 비밀번호 (CLAUDE.md 보안 규칙 5).
        memo: account.memo ?? undefined,
      },
      log,
      deadlineAt: deadline,
    };

    const login = async () => {
      await withDeadline("login", left(), () => crawler.login(ctx));
      await saveStorageState(resort.id, context, SESSION_TTL_MS);
    };

    const ok = initialState
      ? await withDeadline("validate", left(), () => crawler.validateSession(ctx)).catch(() => false)
      : false;
    if (!ok) {
      log("session invalid or absent, performing login");
      await login();
    }

    try {
      return await withDeadline("reservations", left(), () => fetcher(ctx, opts));
    } catch (e) {
      if (!(e instanceof SessionLostError)) throw e;
      // 크롤과 같은 규칙: 세션을 잃었을 때 필요한 것은 로그인 한 번이다. 한 번만.
      log("session lost while fetching, logging in again");
      await clearStorageState(resort.id);
      await login();
      return await withDeadline("reservations", left(), () => fetcher(ctx, opts));
    }
  } finally {
    if (browser) await closeBrowser(browser, log);
  }
}
