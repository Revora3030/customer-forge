import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const forbiddenFiles = [".env", ".env.development", ".env.production", ".env.test", ".env.local"];
const ignoredDirs = new Set([".git", "node_modules", "dist", ".output", ".tanstack", ".nitro", ".wrangler"]);
const errors = [];

for (const name of forbiddenFiles) {
  if (existsSync(join(root, name))) errors.push("Environment file must not exist: " + name);
}

const secretPatterns = [
  ["Stripe secret key", /sk_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{20,}/],
  ["Supabase service-role credential", new RegExp(["service", "_role"].join("") + ".{0,80}(?:" + ["eyJ", "sb_secret_"].join("|") + ")", "i")],
  ["Google API credential", /AIza[0-9A-Za-z_-]{30,}/],
  ["OpenAI API key", /sk-[A-Za-z0-9]{30,}/],
  ["PEM private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) inspect(path);
  }
}

function inspect(path) {
  const rel = relative(root, path).replaceAll("\\", "/");
  if (rel === ".env.example" || rel.endsWith(".lock")) return;
  let content;
  try { content = readFileSync(path, "utf8"); } catch { return; }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) errors.push(label + " pattern detected in " + rel);
  }
}

walk(root);

if (errors.length) {
  console.error("Repository security audit failed:");
  for (const error of errors) console.error("- " + error);
  console.error("Rotate any exposed credential before production use.");
  process.exit(1);
}

console.log("Repository security audit passed.");
