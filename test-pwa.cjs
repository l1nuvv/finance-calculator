const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const handlers = {},
  stored = new Map(),
  deleted = [], precached = [], messages = [];
const shell = {
  addAll: async (urls) =>
    urls.forEach((request) => {
      precached.push(request);
      stored.set(request.url, { shell: true });
    }),
  match: async (request) =>
    stored.get(typeof request === "string" ? request : request.url),
};
const context = {
  URL,
  Request,
  Promise,
  self: {
    location: { href: "https://example.test/finance-calculator/sw.js" },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [
        { url: "https://example.test/finance-calculator/", postMessage: (data) => messages.push(data) },
        { url: "https://example.test/another-app/", postMessage: () => { throw Error("Notified unrelated app"); } },
      ],
    },
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
  assert.ok(precached.every((request) => request.cache === "reload"));
  handlers.activate({
    waitUntil: (p) => {
      job = p;
    },
  });
  await job;
  assert.deepEqual(deleted, ["kontur-shell-old"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "KONTUR_VERSION");
  handlers.message({ data: { type: "KONTUR_VERSION" }, source: {
    url: "https://example.test/finance-calculator/", postMessage: (data) => messages.push(data),
  }});
  assert.equal(messages.length, 2);
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
  context.fetch = async (request, options) => {
    assert.equal(options.cache, "no-store");
    return { ok: true, fresh: true };
  };
  handlers.fetch({
    request: { url: "https://example.test/finance-calculator/", method: "GET", mode: "navigate" },
    respondWith: (p) => { result = p; },
  });
  assert.equal((await result).fresh, true);
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
  await testUpdateUI();
  console.log(
    "PWA checks passed: fresh navigation and precache, offline fallback, scoped version messages, update checks, safe explicit reload, private requests excluded, manifest and icons",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

async function testUpdateUI() {
  const windowEvents = {}, documentEvents = {}, swEvents = {}, elements = new Map();
  let reloads = 0, checks = 0, requests = 0, openDialog = false, offline = false;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: "", querySelector: () => element("update-text") });
    return elements.get(id);
  };
  const controller = { postMessage: () => { requests++; } };
  const registration = { update: async () => { checks++; if (offline) throw Error("offline"); } };
  const ui = {
    Date, Promise, setTimeout, clearTimeout,
    location: { reload: () => { reloads++; } },
    matchMedia: () => ({ matches: true }),
    window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    document: {
      visibilityState: "visible",
      getElementById: element,
      querySelector: (selector) => selector === "dialog[open]" ? (openDialog ? {} : null) : { content: "current" },
      addEventListener: (name, callback) => { documentEvents[name] = callback; },
    },
    navigator: { serviceWorker: {
      controller,
      register: async () => registration,
      addEventListener: (name, callback) => { swEvents[name] = callback; },
    } },
  };
  vm.runInNewContext(fs.readFileSync("pwa.js", "utf8"), ui);
  await windowEvents.load();
  const version = (build, source = controller) => swEvents.message({ source, data: { type: "KONTUR_VERSION", build } });
  version("current");
  assert.equal(element("app-update").hidden, true);
  version("next", {});
  assert.equal(element("app-update").hidden, true);
  version("next");
  assert.equal(element("app-update").hidden, false);
  swEvents.controllerchange();
  assert.ok(requests >= 2);
  assert.equal(reloads, 0, "New worker must not discard an open form by reloading automatically");
  openDialog = true;
  element("apply-update").onclick();
  assert.equal(reloads, 0);
  openDialog = false;
  element("apply-update").onclick();
  assert.equal(reloads, 1);
  await element("check-update").onclick();
  const before = checks;
  documentEvents.visibilitychange();
  assert.equal(checks, before, "Repeated background checks are throttled");
  offline = true;
  await element("check-update").onclick();
  assert.match(element("update-note").textContent, /Проверь интернет/);
  assert.equal(element("check-update").disabled, false);
}
