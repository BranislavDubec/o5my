const CACHE_PREFIX = "o5my-pwa";
const CACHE_VERSION = "v2";
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const IS_LOCAL_DEVELOPMENT = ["localhost", "127.0.0.1"].includes(self.location.hostname);
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
];

self.addEventListener("install", event => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  if (IS_LOCAL_DEVELOPMENT) return;
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authentication and user data must always come from the server.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then(cache => cache.put("/", response.clone()));
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
      }),
    );
  }
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "Máš novú notifikáciu" };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "O5MY Futsal", {
    body: payload.body || "Máš novú notifikáciu",
    icon: payload.icon || "/android-chrome-192x192.png",
    badge: payload.badge || "/android-chrome-192x192.png",
    tag: payload.tag || "o5my-notification",
    renotify: true,
    data: { url: payload.url || "/#/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/#/", self.location.origin).href;

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windowClients => {
    const appClient = windowClients.find(client => new URL(client.url).origin === self.location.origin);
    if (appClient) {
      if ("navigate" in appClient) await appClient.navigate(targetUrl);
      return appClient.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
