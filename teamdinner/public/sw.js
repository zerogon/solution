/**
 * teamdinner 서비스워커.
 *
 * 빌드 플러그인 없이 직접 작성한다 — Next 16은 Turbopack을 쓰는데 Serwist/next-pwa는
 * webpack 설정을 요구해서 충돌한다. (stayhome의 sw.js를 축소한 것)
 *
 * | 대상                          | 전략                               |
 * |-------------------------------|------------------------------------|
 * | 페이지 이동(navigation)       | network-first → 실패 시 `/offline` |
 * | `/_next/static/*`, `/icons/*` | cache-first (해시 박힌 불변 자산)  |
 * | `/api/*`                      | 캐시 안 함 — 5초 폴링 데이터라 낡은 사본을 돌려주면 오히려 해롭다 |
 * | 그 외                         | 캐시 우회                          |
 */

// 캐시 전략이나 precache 목록이 바뀌면 올린다. activate가 이전 접두사 캐시를 지운다.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `teamdinner-static-${CACHE_VERSION}`;
const OFFLINE_CACHE = `teamdinner-offline-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/favicon.png", "/manifest.json"];
const CURRENT_CACHES = [STATIC_CACHE, OFFLINE_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("teamdinner-") && !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    return (
      cached ??
      new Response("오프라인입니다.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
