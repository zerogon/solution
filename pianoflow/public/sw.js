self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome's installability check requires a registered fetch listener.
// A pass-through handler is enough; we deliberately don't intercept requests.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "art'i Piano", body: event.data.text() };
  }

  const title = payload.title || "art'i Piano";
  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/app-icon-192.png",
    badge: payload.badge || "/icons/icon-mark.png",
    data: payload.data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
