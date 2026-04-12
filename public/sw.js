const CACHE_NAME = "mrm-v1";

// Shell assets to cache on install — keep this small
const PRECACHE_URLS = ["/", "/dashboard", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Non-fatal — app still works online
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Network-first strategy for navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip Firebase, API calls, and Next.js internals
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  // Cache-first for icons and static assets
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Network-first for navigation
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(
          (cached) => cached || caches.match("/offline.html")
        )
      )
    );
  }
});
