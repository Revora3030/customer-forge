/**
 * Jarvis quality-gate contract: every place Jarvis creates or edits site content
 * must reach the video-quality gate before visitors see it.
 *
 * - First builds (site-engine worker, also used for prospect demo sites) score
 *   the generated site with gateGeneratedWorkspaceSite.
 * - Chat edits (site-agent) stay in the draft and go live only via publishSiteNow,
 *   whose readiness includes the "video-bar" check.
 * - Restores of checkpoints / versions also go through publishSiteNow.
 * - Only production.functions.ts mints a live snapshot (`live_format: 1`).
 *
 * Source-level checks, so a new bypass fails CI instead of shipping.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".gen.ts") ? [relative(ROOT, full)] : [];
  });
}
const ALL = sources(ROOT);

describe("Jarvis site content passes the video-quality gate", () => {
  it("publishSiteNow runs readiness and honours the video-bar check", () => {
    const prod = code("lib/production.functions.ts");
    expect(prod).toMatch(/async function publishSiteNowUntraced[\s\S]*?gatherReadiness\(supabase, orgId/);
    expect(prod).toMatch(/c\.key === "video-bar"/);
    expect(prod).toMatch(/scoreWorkspaceVideoBar/);
  });

  it("only production.functions.ts mints a live snapshot", () => {
    const writers = ALL.filter((f) => /live_format\s*:\s*1\b/.test(code(f)));
    expect(writers).toEqual(["lib/production.functions.ts"]);
  });

  it("Jarvis chat edits go live only through publishSiteNow", () => {
    const agent = code("lib/site-agent.functions.ts");
    expect(agent).toMatch(/publishSiteNow\(supabase as never, userId, orgId, \{ liveEdit: true \}\)/);
    // Its own website_versions inserts are draft restore points: never published, never live.
    const inserts = [...agent.matchAll(/from\("website_versions"\)\s*\.insert\(\{([\s\S]*?)\}\)\s*\.select/g)].map((m) => m[1]!);
    expect(inserts.length).toBeGreaterThan(0);
    for (const body of inserts) expect(body).not.toMatch(/published_at|live_format/);
    expect(agent).not.toMatch(/publish_state:\s*"published"/);
  });

  it("first builds (and prospect demos via the same worker) are scored by the gate", () => {
    expect(code("lib/site-engine.worker.server.ts")).toMatch(/gateGeneratedWorkspaceSite\(db as never, orgId, "first build"\)/);
    const demo = code("lib/jarvis-demo-site.server.ts");
    expect(demo).not.toMatch(/from\("website_(pages|sections|versions)"\)\s*\.(insert|update|upsert)/);
    expect(demo).toMatch(/publish_state: "draft"/);
    expect(demo).toMatch(/published: false/);
  });

  it("checkpoint and version restores republish through publishSiteNow", () => {
    expect(code("lib/builder/checkpoints.functions.ts")).toMatch(/publishSiteNow\(/);
    expect(code("lib/site-versions.functions.ts")).toMatch(/publishSiteNow\(/);
  });

  it("no Jarvis or agent module flips a site to published directly", () => {
    const agentFiles = ALL.filter((f) => /(^|\/)(jarvis|agent|site-agent)[^/]*$|\/agent\//.test(f));
    expect(agentFiles.length).toBeGreaterThan(0);
    const direct = agentFiles.filter((f) => /publish_state:\s*"published"|published:\s*true\b/.test(code(f)));
    expect(direct).toEqual([]);
  });
});
