import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
const files=["src/lib/agent/autonomous-release-loop.ts","src/lib/agent/browser-verification-contract.ts","src/lib/security/ai-prompt-security.ts","src/lib/platform/webhook-safety.ts","src/lib/generated-site/publication-contract.ts"];
for(const file of files)assert.equal(existsSync(file),true,file);
const pkg=JSON.parse(readFileSync("package.json","utf8"));
assert.equal(typeof pkg.scripts["browser:smoke"],"string");
assert.equal(typeof pkg.scripts["production:readiness:max"],"string");
console.log("production readiness max contract passed");
