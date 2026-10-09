// Catch accidental credentials and personal exports before publication.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      [
        ".git",
        "node_modules",
        "_site",
        "test-results",
        "playwright-report",
      ].includes(item.name) ||
      item.name.includes(".local.")
    )
      continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else files.push(file);
  }
}
walk(root);
const patterns = [
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];
for (const file of files) {
  const name = path.relative(root, file),
    text = fs.readFileSync(file, "utf8");
  assert.ok(
    !/(?:backup|recovery|original).*\.json$|\.env(?:\.|$)|\.zip$/i.test(name),
    "Private artifact: " + name,
  );
  for (const pattern of patterns)
    assert.ok(
      !pattern.test(text),
      "Possible personal data or credential: " + name,
    );
}
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");
assert.match(config, /supabaseKey:\s*["']sb_publishable_[A-Za-z0-9_-]+["']/);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes("Content-Security-Policy"));
assert.ok(!/\son\w+=/i.test(html));
console.log(
  `Public file checks passed (${files.length} files, no private exports, emails or secret keys)`,
);
