// Only this explicit allowlist is deployed. Backups, tests and local files stay off Pages.
const fs = require("node:fs"),
  path = require("node:path");
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
  if (![...files, '.nojekyll'].includes(item)) throw Error('Unexpected file in deploy directory: ' + item);
}
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Static site prepared in _site/");
