import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Playwright needs the Node runtime; each step gets its own invocation and so
// its own 60s budget, which is what runResortCrawl's pass budget is sized to.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Inngest's endpoint. Requests are authenticated by `INNGEST_SIGNING_KEY`
 * inside `serve`, which is why `auth.config.ts` lets `/api/inngest` through
 * without a session — see 보안 규칙 4 in CLAUDE.md.
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
