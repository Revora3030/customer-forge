import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { gateGeneratedSite, type GeneratedSiteGateSummary } from "@/lib/builder/quality/generated-site-gate";
import type { RegenerateFn, RegenerationRequest } from "@/lib/builder/quality/video-gate";
import { badSite, blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";

const bp = blueprintFor("golf course");
const loaded = (input = badSite(bp)) => async () => ({ ...input, tradeSlug: bp.slug });
const quiet = () => undefined;

describe("generator video-bar gate (warn by default)", () => {
  it("scores a below-bar site, stores and logs the result, and never blocks or changes the site", async () => {
    const input = badSite(bp);
    const stored: GeneratedSiteGateSummary[] = [];
    const logs: string[] = [];
    const out = await gateGeneratedSite({ env: {}, load: loaded(input), store: async (s) => void stored.push(s), log: (m) => void logs.push(m) });
    expect(out.status).toBe("scored");
    expect(out.mode).toBe("warn");
    expect(out.blocked).toBe(false);
    if (out.status !== "scored") throw new Error("unreachable");
    expect(out.summary.passed).toBe(false);
    expect(out.summary.attempts).toHaveLength(1);
    expect(out.summary.retriesUsed).toBe(0);
    expect(out.summary.needsHuman.length).toBeGreaterThan(0);
    expect(out.summary.ownerFixes.length).toBeGreaterThan(0);
    expect(out.result.site).toBe(input.site);
    expect(stored).toEqual([out.summary]);
    expect(logs.join("\n")).toMatch(/\(warn\).*below the bar/);
  });

  it("an unknown VIDEO_BAR_GATE value still means warn", async () => {
    const out = await gateGeneratedSite({ env: { VIDEO_BAR_GATE: "maybe" }, load: loaded(), store: async () => undefined, log: quiet });
    expect(out.mode).toBe("warn");
    expect(out.blocked).toBe(false);
  });

  it("off skips the gate without loading anything", async () => {
    const load = vi.fn(loaded());
    const out = await gateGeneratedSite({ env: { VIDEO_BAR_GATE: "off" }, load, store: async () => undefined, log: quiet });
    expect(out).toEqual({ status: "skipped", mode: "off", blocked: false });
    expect(load).not.toHaveBeenCalled();
  });

  it("never throws: a failed load or a failed store is reported, not raised", async () => {
    const failedLoad = await gateGeneratedSite({ env: {}, load: async () => { throw new Error("db down"); }, store: async () => undefined, log: quiet });
    expect(failedLoad).toEqual({ status: "error", mode: "warn", blocked: false, error: "db down" });
    const failedStore = await gateGeneratedSite({ env: {}, load: loaded(), store: async () => { throw new Error("write refused"); }, log: quiet });
    expect(failedStore.status).toBe("scored");
    expect(failedStore.status === "scored" && failedStore.stored).toBe(false);
  });

  it("with a regenerator: only failing sections are sent for repair, at most two passes", async () => {
    const input = badSite(bp);
    const requests: RegenerationRequest[] = [];
    const regenerate: RegenerateFn = async (req) => { requests.push(req); return { sections: [] }; };
    const out = await gateGeneratedSite({ env: {}, load: loaded(input), store: async () => undefined, log: quiet, regenerate });
    if (out.status !== "scored") throw new Error("expected a score");
    expect(out.summary.retriesUsed).toBe(2);
    expect(out.summary.attempts).toHaveLength(3);
    expect(new Set(requests.map((r) => r.attempt))).toEqual(new Set([0, 1]));
    const failingSections = new Set(out.result.attempts[0]!.failures.flatMap((f) => f.sections));
    for (const r of requests) for (const id of r.sectionIds) expect(failingSections.has(id)).toBe(true);
    expect(out.blocked).toBe(false);
  });

  it("with a regenerator a good site is not touched", async () => {
    const regenerate = vi.fn<RegenerateFn>(async () => ({ sections: [] }));
    const out = await gateGeneratedSite({ env: {}, load: loaded(goodSite(bp)), store: async () => undefined, log: quiet, regenerate });
    expect(out.status === "scored" && out.summary.passed).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("the first-build worker calls the gate after the site is saved, inside a try so it cannot fail the build", () => {
    const src = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    const call = src.indexOf('gateGeneratedWorkspaceSite(db as never, orgId, "first build")');
    expect(call).toBeGreaterThan(src.indexOf('noteStage(orgId, runId, "finishing up")'));
    expect(call).toBeLessThan(src.indexOf('status: "completed"'));
    const block = src.slice(src.lastIndexOf("try {", call), src.indexOf("}", src.indexOf("catch (error)", call)) + 1);
    expect(block).toMatch(/catch \(error\) \{\s*console\.warn\("\[site-engine\] video-bar gate skipped"/);
  });
});
