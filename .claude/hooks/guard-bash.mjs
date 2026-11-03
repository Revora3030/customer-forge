#!/usr/bin/env node
// PreToolUse hook for Bash. It only ever blocks (exit 2 + reason on stderr) and
// never rewrites a command. On any unexpected input it allows the command, so a
// bug here cannot wedge a session.
//
// Blocks:
//  1. any read of .env files (except .env.example), so secrets never reach the transcript;
//  2. whole-file dumps (cat/less/bat/...) of lockfiles, generated files, node_modules
//     and build output, which cost tens of thousands of tokens. Bounded reads
//     (rg -m, head, sed -n) stay allowed;
//  3. force pushes, which rewrite history that Lovable syncs from.

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = String(JSON.parse(raw)?.tool_input?.command ?? "");
  } catch {
    process.exit(0);
  }
  const reason = check(command);
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
});

const DUMP_VERBS = new Set(["cat", "less", "more", "bat", "nl", "tac", "strings", "xxd", "od", "base64"]);
const READ_VERBS = new Set([
  ...DUMP_VERBS, "head", "tail", "sed", "awk", "grep", "rg", "egrep", "fgrep", "cut", "sort", "uniq",
  "jq", "source", ".", "diff", "curl", "env", "export", "printenv", "xargs",
]);

function tokens(command) {
  return command
    .split(/[\s;&|()<>`'"]+/)
    .map((t) => t.replace(/^\.\//, ""))
    .filter(Boolean);
}

function baseName(token) {
  return token.split("/").pop() ?? token;
}

function isEnvFile(token) {
  const name = baseName(token);
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
}

function isHeavy(token) {
  const name = baseName(token);
  return (
    name === "bun.lock" ||
    name === "package-lock.json" ||
    name.endsWith(".generated.ts") ||
    name === "routeTree.gen.ts" ||
    token.includes("node_modules/") ||
    /^(dist|\.output|coverage)\//.test(token)
  );
}

function check(command) {
  const words = tokens(command);
  const verbs = new Set(words.map(baseName));

  if (/\bgit\s+push\b/.test(command) && /(\s--force(-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f\b|\s\+\S+)/.test(command)) {
    return "force pushes rewrite published history (AGENTS.md: Lovable sync). Push a new commit instead.";
  }

  const readsSomething = [...verbs].some((v) => READ_VERBS.has(v));
  if (readsSomething && words.some(isEnvFile)) {
    return ".env files hold secrets and must not be read. Use .env.example for variable names.";
  }

  const dumps = [...verbs].some((v) => DUMP_VERBS.has(v));
  if (dumps && words.some(isHeavy)) {
    return "that file is a lockfile, generated file or build output and is too large to dump. Use `rg -n -m 10 <pattern> <file>` or `sed -n 'START,ENDp' <file>`.";
  }
  return null;
}
