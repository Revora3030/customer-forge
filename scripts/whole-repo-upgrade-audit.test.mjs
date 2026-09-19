import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const script = await fs.readFile(path.join(root, "scripts/whole-repo-upgrade-audit.mjs"), "utf8");

assert.match(script, /totalFiles/);
assert.match(script, /supabase\/migrations/);
assert.match(script, /github\/workflows/);
assert.match(script, /PRIVATE KEY/);
assert.match(script, /TODO\|FIXME\|XXX/);
console.log("whole-repo-upgrade-audit contract: PASS");
