"use strict";
const CACHE = "kontur-shell-__BUILD__";
const BUILD = CACHE.slice("kontur-shell-".length);
const PRECACHE = ["index.html"]; // BUILD_PRECACHE
const base = new URL("./", self.location.href);
const allowed = new Set(PRECACHE.map((path) => new URL(path, base).href));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((path) =>
            new Request(new URL(path, base).href, { cache: "reload" }),
          ),
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
            .filter((key) => key.startsWith("kontur-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) =>
        clients.forEach((client) => {
          if (client.url.startsWith(base.href))
            client.postMessage({ type: "KONTUR_VERSION", build: BUILD });
        }),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (
    event.data?.type === "KONTUR_VERSION" &&
    event.source?.url?.startsWith(base.href)
  )
    event.source.postMessage({ type: "KONTUR_VERSION", build: BUILD });
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept authentication, database traffic, POSTs or unrelated sites.
  if (
    event.request.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw Error("Navigation unavailable");
          return response;
        })
        .catch(() =>
          caches
            .open(CACHE)
            .then((cache) => cache.match(new URL("index.html", base).href)),
        ),
    );
    return;
  }
  if (allowed.has(url.href))
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(event.request)) || fetch(event.request),
        ),
    );
});
