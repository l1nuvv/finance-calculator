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
  "config.js",
  "engine.js",
  "sync-core.js",
  "cloud.js",
  "sync-controller.js",
  "app.js",
];
for (const item of fs.readdirSync(out)) {
  if (![...files, ".nojekyll"].includes(item))
    throw Error("Unexpected file in deploy directory: " + item);
}
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const file of files.filter((file) => file !== "index.html")) {
  const content = fs.readFileSync(path.join(root, file));
  const version = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  const reference = `"${file}"`;
  if (html.split(reference).length !== 2)
    throw Error("Expected exactly one HTML asset reference: " + file);
  html = html.replace(reference, `"${file}?v=${version}"`);
  fs.writeFileSync(path.join(out, file), content);
}
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Static site prepared in _site/");
