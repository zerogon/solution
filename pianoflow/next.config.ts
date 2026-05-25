import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development";

const withPWA = withPWAInit({
  dest: "public",
  disable: isDev,
  register: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

const nextConfig: NextConfig = {
  // next-pwa는 webpack 기반이므로 dev에서는 Turbopack을 그대로 사용
  // 프로덕션 빌드에서만 PWA가 활성화되며 자동으로 webpack 모드로 전환됨
  turbopack: {},
};

export default isDev ? nextConfig : withPWA(nextConfig);
