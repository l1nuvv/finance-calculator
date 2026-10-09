// Development only. Bind loopback and reject path traversal.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".sql": "text/plain",
  ".md": "text/plain",
};
http
  .createServer((req, res) => {
    let name;
    try {
      name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.resolve(
      root,
      "." + (name === "/" ? "/index.html" : name),
    );
    if (!file.startsWith(root + path.sep) || name.includes("/.")) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        (types[path.extname(file)] || "text/plain") + "; charset=utf-8",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    });
  })
  .listen(8765, "127.0.0.1", () =>
    console.log("Kontur: http://127.0.0.1:8765"),
  );
