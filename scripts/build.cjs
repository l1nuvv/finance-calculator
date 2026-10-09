// Only this explicit allowlist is deployed. Backups, tests and local files stay off Pages.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "_site");
fs.mkdirSync(out, { recursive: true });
const files = [
  "index.html",
  "style.css",
  "theme.js",
  "config.js",
  "engine.js",
  "sync-core.js",
  "cloud.js",
  "sync-controller.js",
  "app.js",
  "help.js",
  "pwa.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];
for (const item of fs.readdirSync(out)) {
  if (![...files, ".nojekyll"].includes(item))
    throw Error("Unexpected file in deploy directory: " + item);
}
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const versions = {};
for (const file of files.filter(
  (file) => !["index.html", "sw.js", "manifest.webmanifest"].includes(file),
)) {
  const content = fs.readFileSync(path.join(root, file));
  const version = crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 16);
  const reference = `"${file}"`;
  if (html.split(reference).length !== 2 && file !== "icon-512.png")
    throw Error("Expected exactly one HTML asset reference: " + file);
  html = html.replace(reference, `"${file}?v=${version}"`);
  fs.writeFileSync(path.join(out, file), content);
  versions[file] = version;
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"),
);
manifest.icons.forEach((icon) => {
  icon.src += "?v=" + versions[icon.src];
});
const manifestText = JSON.stringify(manifest, null, 2);
versions["manifest.webmanifest"] = crypto
  .createHash("sha256")
  .update(manifestText)
  .digest("hex")
  .slice(0, 16);
fs.writeFileSync(path.join(out, "manifest.webmanifest"), manifestText);
html = html.replace(
  '"manifest.webmanifest"',
  `"manifest.webmanifest?v=${versions["manifest.webmanifest"]}"`,
);
fs.writeFileSync(path.join(out, "index.html"), html);
const build = crypto
  .createHash("sha256")
  .update(html)
  .digest("hex")
  .slice(0, 16);
const worker = fs
  .readFileSync(path.join(root, "sw.js"), "utf8")
  .replace("__BUILD__", build)
  .replace(
    'const PRECACHE = ["index.html"]; // BUILD_PRECACHE',
    "const PRECACHE = " +
      JSON.stringify([
        "index.html",
        ...Object.entries(versions).map(
          ([file, version]) => `${file}?v=${version}`,
        ),
      ]) +
      ";",
  );
fs.writeFileSync(path.join(out, "sw.js"), worker);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Static site prepared in _site/");
