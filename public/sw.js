/* JARVIS service worker — network-first shell so updates arrive promptly,
   with cached fallback for offline use */
const CACHE = "alfred-night-command-fox-v53";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./fox-emblem.webp",
  "./fox-icon-192.png",
  "./fox-icon-512.png",
  "./fox-launch-v1.css",
  "./fox-launch-v1.js",
  "./fox-opening-poster.webp",
  "./alfred-ion-skyline.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("alfred-night-command-") || k.startsWith("alfred-night-command-fox-")) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Let the browser stream byte ranges directly; do not clone video responses
  // or replace unavailable video bytes with the cached HTML page.
  if (event.request.destination === "video" || event.request.headers.has("Range")) return;

  // API: network first, no offline caching of responses (DB is source of truth)
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ message: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Static shell: network first (so app updates load right away), cached
  // fallback for offline use
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
