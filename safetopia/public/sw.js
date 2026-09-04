/**
 * safetopia 서비스워커.
 *
 * 빌드 플러그인 없이 직접 작성한다 — Next 16은 Turbopack을 쓰는데 Serwist/next-pwa는
 * webpack 설정을 요구해서 충돌한다.
 *
 * ## 캐시 전략
 *
 * | 대상                          | 전략                                   |
 * |-------------------------------|----------------------------------------|
 * | 페이지 이동(navigation)       | network-first → 실패 시 `/offline`     |
 * | `/api/holidays`               | stale-while-revalidate                 |
 * | `/_next/static/*`, `/icons/*` | cache-first                            |
 * | 그 외 전부                    | 캐시 우회 (network only)               |
 *
 * ## 인증된 HTML은 캐시하지 않는다 (의도적 판단)
 *
 * 앱 셸을 precache하면 완전 오프라인에서도 화면이 뜨지만, 직원별 연차·사유 같은
 * 개인정보가 담긴 로그인 상태의 HTML이 디스크 캐시에 남는 것을 피한다. 대신
 * `/api/holidays`(공휴일, 개인정보 없음)만 SWR로 캐시하고, 완전 오프라인에서는
 * `/offline` 안내 페이지가 뜬다.
 *
 * `/api/auth/*`는 어떤 경우에도 캐시에 닿지 않는다 — 아래 `shouldBypass()`가
 * GET 이외 전부와 함께 걸러낸다.
 */

// 캐시된 API 응답 형태가 바뀌면 올린다. 올리면 activate 핸들러가 이전 접두사 캐시를 지운다.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `safetopia-static-${CACHE_VERSION}`;
const DATA_CACHE = `safetopia-data-${CACHE_VERSION}`;
const OFFLINE_CACHE = `safetopia-offline-${CACHE_VERSION}`;

const OFFLINE_URL = "/offline";

/** 오프라인 폴백에 필요한 최소 자산. 인증이 필요 없는 것만 담는다. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/favicon.png",
  "/manifest.json",
];

const CURRENT_CACHES = [STATIC_CACHE, DATA_CACHE, OFFLINE_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      // 개별 실패가 설치 전체를 막지 않도록 하나씩 담는다.
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
        ),
      )
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
            .filter((k) => k.startsWith("safetopia-") && !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 캐시에 절대 닿으면 안 되는 요청. */
function shouldBypass(request, url) {
  if (request.method !== "GET") return true;
  // 인증·크론 응답은 캐시 금지.
  if (url.pathname.startsWith("/api/auth")) return true;
  if (url.pathname.startsWith("/api/cron")) return true;
  return false;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")
  );
}

/** 앱 셸/페이지 HTML은 저장하지 않는다. 끊기면 오프라인 안내로 넘긴다. */
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

/** 캐시를 즉시 돌려주고 뒤에서 갱신한다. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  // 명시적 새로고침은 캐시본을 건너뛴다.
  // `cache.match`는 기본적으로 요청 헤더를 무시하므로 캐시 키는 쪼개지지 않는다.
  const wantsFresh = request.headers.get("x-fresh") === "1";

  if (cached && !wantsFresh) {
    // 갱신은 백그라운드로 흘려보내고 캐시본을 먼저 그린다.
    return cached;
  }
  const fresh = await network;
  return (
    fresh ??
    cached ??
    new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // 빌드 해시가 박힌 정적 자산이라 불변으로 취급해도 안전하다.
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 다른 오리진은 건드리지 않는다.
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname === "/api/holidays") {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;

  // 로그아웃 시 호출된다 (src/lib/sw-client.ts). 런타임 캐시를 비운다.
  // 오프라인 폴백은 남겨둔다.
  if (type === "CLEAR_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k === DATA_CACHE || k === STATIC_CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
    );
    return;
  }

  // 새 버전을 즉시 활성화 (ServiceWorkerManager의 "새로고침" 액션).
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Safetopia", body: event.data.text() };
  }

  const title = payload.title || "Safetopia";
  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/favicon.png",
    data: payload.data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
