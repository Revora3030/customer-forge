/**
 * JC-63: client bundle gzip budget helpers (no deps; Node zlib).
 * Scene runtime / draw-call budgets belong to JC-18 — do not add them here.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { minimatch } from "./perf-budgets-minimatch.mjs";

export function resolveAssetsDir(cwd = process.cwd(), dirs = [".output/public/assets", "dist/assets"]) {
  for (const d of dirs) {
    const abs = join(cwd, d);
    if (existsSync(abs)) return abs;
  }
  return null;
}

export function listAssetFiles(dir) {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .map((name) => {
      const path = join(dir, name);
      const raw = statSync(path).size;
      const gzip = gzipSync(readFileSync(path), { level: 9 }).length;
      return { name, path, raw, gzip };
    });
}

export function matchFiles(files, glob) {
  return files.filter((f) => minimatch(f.name, glob));
}

export function metricValue(files, metric) {
  if (metric === "gzipSum") return files.reduce((s, f) => s + f.gzip, 0);
  if (metric === "gzipMax") return files.reduce((m, f) => Math.max(m, f.gzip), 0);
  if (metric === "rawSum") return files.reduce((s, f) => s + f.raw, 0);
  if (metric === "rawMax") return files.reduce((m, f) => Math.max(m, f.raw), 0);
  throw new Error(`unknown metric: ${metric}`);
}

/**
 * @returns {{ ok: boolean, results: Array<object>, errors: string[] }}
 */
export function evaluateBudgets(files, budgets) {
  const results = [];
  const errors = [];
  for (const b of budgets) {
    const matched = matchFiles(files, b.glob);
    if (matched.length === 0) {
      const msg = `${b.id}: no files matched ${b.glob}`;
      if (b.required) errors.push(msg);
      results.push({ id: b.id, matched: 0, value: 0, maxBytes: b.maxBytes, ok: !b.required, skipped: !b.required });
      continue;
    }
    const value = metricValue(matched, b.metric);
    const ok = value <= b.maxBytes;
    if (!ok) {
      errors.push(
        `${b.id}: ${b.metric}=${value} exceeds maxBytes=${b.maxBytes} (${matched.length} file(s); largest ${[...matched].sort((a, c) => c.gzip - a.gzip)[0]?.name ?? "?"})`,
      );
    }
    results.push({
      id: b.id,
      matched: matched.length,
      value,
      maxBytes: b.maxBytes,
      ok,
      files: matched
        .slice()
        .sort((a, c) => c.gzip - a.gzip)
        .slice(0, 5)
        .map((f) => ({ name: f.name, gzip: f.gzip, raw: f.raw })),
    });
  }
  return { ok: errors.length === 0, results, errors };
}

export function loadBudgetsConfig(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
