const CACHE_NAME = "worldcup-toto-cache-v3";
const SCOPE_URL = self.registration.scope;
const CORE_ASSETS = ["manifest.webmanifest", "plax-logo.png"];

function resolveInScope(path) {
  return new URL(path, SCOPE_URL).href;
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(SCOPE_URL, { cache: "reload" });
  const html = await response.clone().text();
  const assetUrls = Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g))
    .map((match) => {
      try {
        const url = new URL(match[1], SCOPE_URL);
        return url.origin === self.location.origin && url.href.startsWith(SCOPE_URL)
          ? url.href
          : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  await cache.put(SCOPE_URL, response);
  await cache.addAll([...new Set([...CORE_ASSETS.map(resolveInScope), ...assetUrls])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(SCOPE_URL, copy));
          return response;
        })
        .catch(() => caches.match(SCOPE_URL)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
