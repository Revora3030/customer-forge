import {existsSync,readFileSync} from "node:fs";
const required=["src/lib/agent/autonomous-release-loop.ts","src/lib/agent/browser-verification-contract.ts","src/lib/builder/site-quality-contract.ts","src/lib/security/ai-prompt-security.ts","src/lib/platform/lifecycle-contract.ts","src/lib/platform/webhook-safety.ts","src/lib/ops/recovery-journal.ts","src/lib/ops/observability-contract.ts","src/lib/seo/site-seo-contract.ts","src/lib/accessibility/a11y-contract.ts","src/lib/performance/performance-budget.ts","src/lib/quality/change-impact.ts","src/lib/quality/quality-score.ts","src/lib/generated-site/publication-contract.ts","scripts/browser-smoke.mjs"];
const missing=required.filter(path=>!existsSync(path));
if(missing.length){console.error(JSON.stringify({ok:false,missing},null,2));process.exit(1);}
const pkg=JSON.parse(readFileSync("package.json","utf8"));
const requiredScripts=["browser:smoke","production:readiness:max"];
const missingScripts=requiredScripts.filter(name=>!pkg.scripts?.[name]);
if(missingScripts.length){console.error(JSON.stringify({ok:false,missingScripts},null,2));process.exit(1);}
console.log(JSON.stringify({ok:true,requiredFiles:required.length,requiredScripts},null,2));
