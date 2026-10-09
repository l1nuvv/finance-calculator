"use strict";
const CACHE = "kontur-shell-__BUILD__";
const PRECACHE = ["index.html"]; // BUILD_PRECACHE
const base = new URL("./", self.location.href);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE.map((path) => new URL(path, base).href)),
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
      .then(() => self.clients.claim()),
  );
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
      fetch(event.request)
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
  const allowed = PRECACHE.map((path) => new URL(path, base).href);
  if (allowed.includes(url.href))
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(event.request)) || fetch(event.request),
        ),
    );
});
