import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 네이버 플레이스 메뉴 썸네일(ldb-phinf.pstatic.net 등 pstatic 계열).
    remotePatterns: [{ protocol: "https", hostname: "**.pstatic.net" }],
  },

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
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
