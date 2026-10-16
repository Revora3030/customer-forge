/**
 * Builder reliability fixes found by the October bug hunt. Each test pins the
 * code shape that closes one confirmed defect, so a later edit can't reopen it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("queued plans keep their own actions", () => {
  const hooks = read("src/lib/builder-requests.hooks.ts");

  it("stores and reads approved actions per request, never by bare step key", () => {
    expect(hooks).toContain("actionsRef.current.set(actionKey(task.id, step.key), step)");
    expect(hooks).toContain("actionsRef.current.get(actionKey(task.id, step.key))");
    expect(hooks).not.toMatch(/actionsRef\.current\.(get|set)\(step\.key/);
  });
});

describe("apply idempotency only answers with verified outcomes", () => {
  const fn = read("src/lib/site-agent.functions.ts");

  it("records agent_apply after live-page verification, not before", () => {
    const verify = fn.indexOf("verification = await verifyWorkspaceSite(supabase, orgId);");
    const record = fn.indexOf('kind: "agent_apply",');
    expect(verify).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(verify);
  });

  it("claims the key before the first write and tags every undo with it", () => {
    const claim = fn.indexOf('kind: "agent_apply_claim"');
    const firstWrite = fn.indexOf('noteApplyStage(orgId, applyRunId, "writing the pages")');
    expect(claim).toBeGreaterThan(firstWrite);
    for (const kind of ["agent_apply_rolled_back", "agent_apply_failed_verification"]) {
      const at = fn.indexOf(`kind: "${kind}"`);
      expect(fn.slice(at, at + 400)).toContain("operationKey: data.operationKey || null");
    }
  });

  it("waits for a claimed run instead of applying the same batch twice", () => {
    expect(fn).toContain("outcome.claimed && !outcome.applied && !outcome.undone && wait < 33");
  });
});
