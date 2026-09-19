import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", "dist", ".output", ".vinxi"]);
const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".md", ".sql",
  ".yml", ".yaml", ".toml", ".txt", ".html", ".xml", ".webmanifest",
]);

const files = [];
const findings = [];
const extensionCounts = new Map();

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }

    const stat = await fs.stat(full);
    const ext = path.extname(entry.name).toLowerCase() || "[none]";
    extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);

    let text = null;
    if (textExtensions.has(ext) || entry.name.startsWith(".")) {
      try { text = await fs.readFile(full, "utf8"); } catch {}
    }

    files.push({ path: relative, size: stat.size, text });

    if (stat.size > 100_000) {
      findings.push({ severity: "info", path: relative, message: "large text/binary artifact over 100 KB" });
    }

    if (text) {
      if (/\b(TODO|FIXME|XXX)\b/.test(text)) {
        findings.push({ severity: "info", path: relative, message: "contains TODO/FIXME marker" });
      }
      if (/(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) {
        findings.push({ severity: "error", path: relative, message: "possible credential/private-key pattern" });
      }
      if (/VITE_[A-Z0-9_]+\s*=\s*["'][^"']{12,}["']/.test(text) && !relative.endsWith(".example")) {
        findings.push({ severity: "warning", path: relative, message: "possible hard-coded VITE environment value" });
      }
    }
  }
}

await walk(root);

const source = files.filter((file) => file.path.startsWith("src/"));
const tests = source.filter((file) => /(^|\.)test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(file.path));
const migrations = files.filter((file) => file.path.startsWith("supabase/migrations/") && file.path.endsWith(".sql"));
const routes = files.filter((file) => file.path.startsWith("src/routes/") && /\.(tsx?|ts)$/.test(file.path));
const workflows = files.filter((file) => file.path.startsWith(".github/workflows/"));

const report = {
  generatedAt: new Date().toISOString(),
  totalFiles: files.length,
  sourceFiles: source.length,
  testFiles: tests.length,
  migrationFiles: migrations.length,
  routeFiles: routes.length,
  workflowFiles: workflows.length,
  extensionCounts: Object.fromEntries([...extensionCounts].sort(([a], [b]) => a.localeCompare(b))),
  findings,
  status: findings.some((finding) => finding.severity === "error") ? "fail" : "pass",
};

console.log(JSON.stringify(report, null, 2));

if (report.status === "fail") process.exitCode = 1;
