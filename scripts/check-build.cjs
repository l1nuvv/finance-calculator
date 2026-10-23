// Validate the actual deploy output, including content versions and offline assets.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"),
  assert = require("node:assert/strict"), { createHash } = require("node:crypto");
const files = require("./public-files.cjs"), root = path.resolve(__dirname, ".."),
  out = path.join(root, "_site"), base = "https://example.test/finance-calculator/";
const read = (file) => fs.readFileSync(path.join(out, file));
const hash = (file) => createHash("sha256").update(read(file)).digest("hex").slice(0, 16);
assert.deepEqual(fs.readdirSync(out).sort(), [...files, ".nojekyll"].sort(), "Unexpected deploy files");
assert.equal(read(".nojekyll").length, 0);
const html = read("index.html").toString();
assert.ok(!html.includes("__BUILD__"), "Unresolved HTML build version");
const build = html.match(/name="kontur-build" content="([a-f0-9]{16})"/)?.[1];
assert.ok(build, "Missing HTML build version");
for (const file of files.filter((file) => /\.(js|css|png)$/.test(file) && file !== "sw.js")) {
  assert.ok(read(file).equals(fs.readFileSync(path.join(root, file))), "Asset differs from source: " + file);
  if (file !== "icon-512.png")
    assert.ok(html.includes(`"${file}?v=${hash(file)}"`), "Wrong HTML asset version: " + file);
}
assert.ok(html.includes(`"manifest.webmanifest?v=${hash("manifest.webmanifest")}"`));
for (const icon of JSON.parse(read("manifest.webmanifest")).icons) {
  const url = new URL(icon.src, base), file = path.basename(url.pathname);
  assert.ok(files.includes(file));
  assert.equal(url.searchParams.get("v"), hash(file), "Wrong manifest icon version");
}
const handlers = {}, precached = [];
vm.runInNewContext(read("sw.js").toString(), {
  URL, Request,
  self: {
    location: { href: base + "sw.js" },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => {},
  },
  caches: { open: async () => ({
    addAll: async (requests) => precached.push(...requests),
    match: async () => ({ text: async () => html }),
  }) },
});
(async () => {
  let job;
  handlers.install({ waitUntil: (promise) => { job = promise; } });
  await job;
  assert.deepEqual(precached.map((request) => path.basename(new URL(request.url).pathname)).sort(),
    files.filter((file) => file !== "sw.js").sort(), "Offline shell misses a public asset");
  for (const request of precached) {
    const url = new URL(request.url), file = path.basename(url.pathname);
    assert.equal(url.origin + url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1), base);
    assert.equal(request.cache, "reload");
    if (file !== "index.html") assert.equal(url.searchParams.get("v"), hash(file));
    else assert.equal(url.searchParams.get("kontur-build"), build);
  }
  let reported;
  handlers.message({ data: { type: "KONTUR_VERSION" }, source: {
    url: base, postMessage: (value) => { reported = value.build; },
  } });
  assert.equal(reported, build, "Worker and HTML build versions differ");
  console.log(`Build checks passed (${files.length + 1} allowed files, matching versions and complete offline shell)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
