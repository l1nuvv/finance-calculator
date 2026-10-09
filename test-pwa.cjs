const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const handlers = {},
  stored = new Map(),
  deleted = [];
const shell = {
  addAll: async (urls) =>
    urls.forEach((url) => stored.set(url, { shell: true })),
  match: async (request) =>
    stored.get(typeof request === "string" ? request : request.url),
};
const context = {
  URL,
  Promise,
  self: {
    location: { href: "https://example.test/finance-calculator/sw.js" },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches: {
    open: async () => shell,
    keys: async () => ["kontur-shell-old", "unrelated-app"],
    delete: async (key) => deleted.push(key),
  },
  fetch: async () => {
    throw Error("offline");
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("sw.js", "utf8"), context);
(async () => {
  let job;
  handlers.install({
    waitUntil: (p) => {
      job = p;
    },
  });
  await job;
  assert.ok(stored.has("https://example.test/finance-calculator/index.html"));
  handlers.activate({
    waitUntil: (p) => {
      job = p;
    },
  });
  await job;
  assert.deepEqual(deleted, ["kontur-shell-old"]);
  let result;
  handlers.fetch({
    request: {
      url: "https://example.test/finance-calculator/?v=new",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => {
      result = p;
    },
  });
  assert.equal((await result).shell, true);
  for (const request of [
    { url: "https://cloud.example.test/auth/v1/token", method: "POST" },
    {
      url: "https://cloud.example.test/rest/v1/rpc/kontur_read",
      method: "GET",
    },
    { url: "https://example.test/another-app/", method: "GET" },
    { url: "https://example.test/finance-calculator/private", method: "POST" },
  ]) {
    handlers.fetch({
      request,
      respondWith: () => {
        throw Error("Intercepted sensitive or unrelated request");
      },
    });
  }
  const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}`);
    assert.ok(icon);
    const png = fs.readFileSync(icon.src);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  console.log(
    "PWA checks passed: scoped shell cache, offline navigation, private requests excluded, manifest and icon dimensions",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
