const CACHE_NAME = "tik-packing-v6";

const STATIC_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./order.html",
  "./admin.html",
  "./admin-v2.html",
  "./admin-availability.js",
  "./customer-availability.js"
];

const STATIC_PATHS = new Set(
  STATIC_FILES.map(path => new URL(path, self.location.href).pathname)
);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("tik-packing-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC_PATHS.has(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await cache.match("./index.html"));
      })
  );
});
