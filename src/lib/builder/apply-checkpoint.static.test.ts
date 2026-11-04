/**
 * Every builder apply must be revertible: a website_versions checkpoint is
 * written and confirmed before the first mutation, and a failed checkpoint
 * stops the apply with nothing written. These are source-order checks on
 * `applyImpl`, because the function itself needs a live database.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/site-agent.functions.ts", "utf8");
const start = source.indexOf("async function applyImpl(");
const end = source.indexOf("/* ------------------------------ voice commands", start);
const body = source.slice(start, end);

const at = (pattern: RegExp) => body.search(pattern);
const checkpointAt = () => at(/\.from\("website_versions"\)\s*\.insert\(/);

/** First write to a site table inside applyImpl (insert/update/upsert/delete). */
const firstSiteMutation = () => {
  const pattern = /\.from\("(website_pages|website_sections|website_components|website_settings|business_profiles|media)"\)\s*\.(insert|update|upsert|delete)\(/g;
  const match = pattern.exec(body);
  return match ? match.index : -1;
};

describe("apply checkpoint (website_versions) before every mutation", () => {
  it("finds applyImpl", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it("inserts the website_versions restore point before the first site write", () => {
    const checkpoint = checkpointAt();
    const mutation = firstSiteMutation();
    expect(checkpoint).toBeGreaterThan(0);
    expect(mutation).toBeGreaterThan(checkpoint);
  });

  it("refuses to write when the restore point could not be saved", () => {
    const guard = body.indexOf("if (!snapshotId) {");
    const refusal = body.indexOf("Revora couldn't save a restore point for your website, so nothing was changed.");
    expect(guard).toBeGreaterThan(0);
    expect(refusal).toBeGreaterThan(guard);
    expect(firstSiteMutation()).toBeGreaterThan(refusal);
  });

  it("returns counts without writing when nothing in the bundle could be placed", () => {
    const early = body.indexOf("if (!actions.length) {");
    const checkpoint = checkpointAt();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(checkpoint);
    const earlyBlock = body.slice(early, checkpoint);
    expect(earlyBlock).toContain("applied: 0,");
    expect(earlyBlock).toContain("stale: staleCount,");
  });
});

describe("fail-safe mutations wiring", () => {
  it("resolves section targets before the plan is parsed and audited", () => {
    const resolve = body.indexOf("resolvePlanTargets(data.actions");
    const read = at(/readActions\(\s*targets\.actions/);
    const preflight = body.indexOf("preflightActions(");
    expect(resolve).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(resolve);
    expect(preflight).toBeGreaterThan(read);
  });

  it("logs which strategy matched for every resolved target", () => {
    expect(body).toContain('console.info("[site-agent] section target resolved", { operationId, type: entry.type, strategy: entry.strategy');
  });

  it("skips a single failed or invalid step instead of reversing the whole bundle", () => {
    expect(body).toContain("if (options.fatalOnError ?? false) fatal = error;");
    expect(body).not.toMatch(/fatal = new Error\("A (section|component) reorder/);
    // A failed step reverses only what it wrote itself.
    expect(body).toContain("const own = undoSteps.splice(ownUndoStart);");
  });

  it("reports low-confidence skips in the stale count the chat card shows", () => {
    expect(body).toContain("stale: staleCount,");
    expect(body).not.toContain("stale: preflight.stale.length,");
  });
});
