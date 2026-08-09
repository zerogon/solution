import type { NextConfig } from "next";

/**
 * Routes that launch Playwright. Their traces come out one file short:
 * `playwright-core` is externalized and 80 of its files get traced, but
 * `browsers.json` is read with `fs` at import time rather than `require`d, so
 * the tracer never sees it and the function dies on load:
 *
 *   Failed to load external module playwright-core:
 *   Cannot find module '/var/task/.../playwright-core/browsers.json'
 *
 * That is a 500 before any handler code runs, which is why `/api/inngest`
 * could not be synced at all — Inngest's own request never reached `serve()`.
 *
 * The whole package (13MB) is included rather than just the one file: the
 * failure mode is a route that is dead on arrival in production and fine in
 * `next dev`, and 13MB is not worth risking a second round of it.
 */
const PLAYWRIGHT_ROUTES = ["/api/inngest", "/api/resorts/\\[slug\\]/refresh"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(
    PLAYWRIGHT_ROUTES.map((route) => [route, ["./node_modules/playwright-core/**/*"]]),
  ),

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // 서비스워커는 캐시되면 안 된다 — 캐시되는 순간 사용자가 낡은 워커에
        // 묶여서 캐시 전략을 고쳐 배포해도 반영되지 않는다.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
