// The browser proof's offline shell (rev 6 phase 4, D7): the page itself must load with no network
// so what IndexedDB holds can still be read. Network first for this origin's own GETs, the last good
// copy when the network fails. Nothing else is cached: never a world service's frames or blobs
// (other origins), never a POST. The world's data lives in IndexedDB, not here.

const CACHE = "unmapped-browser-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const kept = await caches.match(request);
        return kept ?? Response.error();
      }),
  );
});
