import assert from "node:assert/strict";
import {getToolDefinitions,normalizeRepoPrefix,validateRepoPath} from "./jarvis-mcp-server.mjs";
const t=getToolDefinitions();assert.equal(t.length,5);assert.ok(t.every(x=>x.inputSchema.additionalProperties===false));assert.ok(t.every(x=>!/delete|write|shell|sql|execute command/i.test(x.name+" "+x.description)));
for(const good of ["src/lib/ai/config.ts",".github/workflows/quality-gate.yml","docs/README.md"])assert.equal(validateRepoPath(good),good);
assert.equal(normalizeRepoPrefix(""),"");assert.equal(normalizeRepoPrefix("src/lib/"),"src/lib/");assert.equal(normalizeRepoPrefix("src/lib"),"src/lib");assert.throws(()=>normalizeRepoPrefix("src//"),/not allowed/);
for(const bad of ["../.env","/etc/passwd",".env",".env.example","src/../.env","src/lib/credentials/token.json","src\\..\\.env","src//lib/file.ts"])assert.throws(()=>validateRepoPath(bad),/not allowed/);
console.log(JSON.stringify({ok:true,tools:t.map(x=>x.name),pathSafetyCases:8},null,2));
