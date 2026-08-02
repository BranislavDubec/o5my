const CACHE_PREFIX = "o5my-pwa";
const CACHE_VERSION = "v1";
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
];

self.addEventListener("install", event => {
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
