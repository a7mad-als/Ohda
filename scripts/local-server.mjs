// Local preview server: serves the built site and the API on one port,
// the same way Vercel does (static files + /api/* function + SPA fallback).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "artifacts/ohda/dist/public");
const { default: api } = await import(path.join(root, "artifacts/api-server/dist/vercel.mjs"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const port = Number(process.env.PORT || 5000);

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return api(req, res);
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(publicDir, urlPath);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(publicDir, "index.html");
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Ohda local preview on http://localhost:${port}`));
