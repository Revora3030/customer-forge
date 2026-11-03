/**
 * Serves BEFORE (:4528, browser-only draft) and AFTER (:4529, server-rendered
 * draft with the hero preload) from the same build. Both pay the same
 * simulated database round trip (DB_MS); only where it happens differs.
 * Local only, fictional data, no network calls.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const client = path.join(dir, "dist/client");
const manifest = JSON.parse(fs.readFileSync(path.join(client, ".vite/manifest.json"), "utf8"));
const { render, sections } = await import(path.join(dir, "dist/server/entry-server.js"));
const DB_MS = Number(process.env.DB_MS ?? 250);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".jpg": "image/jpeg", ".json": "application/json" };

function serveFile(res, file) {
  if (!file.startsWith(client) && !file.startsWith(path.join(dir, "public"))) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

function afterHtml(withPreload = true) {
  const entry = manifest["entry-after.tsx"];
  const { html, preload } = render();
  const pre = preload && withPreload ? `<link rel="preload" as="image" href="${preload.href}" fetchpriority="high"${preload.imageSrcSet ? ` imagesrcset="${preload.imageSrcSet}" imagesizes="${preload.imageSizes}"` : ""}>` : "";
  const css = (entry.css ?? []).map((c) => `<link rel="stylesheet" href="/${c}">`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>After: server-rendered draft (fictional sample)</title>${pre}${css}<script type="module" src="/${entry.file}"></script></head><body style="margin:0"><div id="root">${html}</div></body></html>`;
}

function handler(mode) {
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/fixture/")) return serveFile(res, path.join(dir, "public", url.pathname));
    if (url.pathname === "/api/draft") {
      await wait(DB_MS);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(sections));
    }
    if (url.pathname === "/" && mode === "before") return serveFile(res, path.join(client, "before.html"));
    if ((url.pathname === "/" && mode === "after") || url.pathname === "/p-sample") {
      await wait(DB_MS);
      const { headers } = render();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
      return res.end(afterHtml(!url.searchParams.has("nopre")));
    }
    if (url.pathname === "/builder") return serveFile(res, path.join(client, "builder.html"));
    return serveFile(res, path.join(client, url.pathname));
  };
}

http.createServer(handler("before")).listen(4528, "127.0.0.1");
http.createServer(handler("after")).listen(4529, "127.0.0.1");
console.log(`harness up: before :4528, after :4529 (DB_MS=${DB_MS})`);
