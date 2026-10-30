import { describe, expect, it, vi } from "vitest";
import { panelFor, runReviewPanel, type Thinker } from "@/lib/builder/review-panel.server";

const ok = (text: string, model = "lovable · m", cost = 10) => ({ ok: true, text, model, costMicrocents: cost, tier: "terra", wanted: "terra" }) as never;
const fail = (reason: string) => ({ ok: false, reason, detail: reason, tier: "terra", wanted: "terra" }) as never;

describe("review panel retries", () => {
  it("retries a reviewer whose answer could not be parsed, and counts both paid answers", async () => {
    const seen = new Map<string, number>();
    const thinker = vi.fn(async (request: { area?: string }) => {
      const n = (seen.get(request.area!) ?? 0) + 1;
      seen.set(request.area!, n);
      if (request.area === "seo" && n === 1) return ok("Looks fine to me!");
      return ok('{"issues": [], "severity": "low"}');
    }) as unknown as Thinker;
    const panel = await runReviewPanel({ organizationId: "org", material: "x", mode: "light" }, thinker);
    expect(seen.get("seo")).toBe(2);
    expect(panel.failed).toEqual([]);
    expect(panel.notes).toHaveLength(panelFor("light").length);
    expect(panel.costMicrocents).toBe((panelFor("light").length + 1) * 10);
  });

  it("does not retry when the paid budget is spent, and reports the reviewer as failed", async () => {
    const thinker = vi.fn(async () => fail("budget_exhausted")) as unknown as Thinker;
    const panel = await runReviewPanel({ organizationId: "org", material: "x", mode: "light" }, thinker);
    expect(thinker).toHaveBeenCalledTimes(panelFor("light").length);
    expect(panel.failed).toHaveLength(panelFor("light").length);
    expect(panel.costMicrocents).toBe(0);
  });

  it("still retries a reviewer that failed for a transient reason", async () => {
    let first = true;
    const thinker = vi.fn(async (request: { area?: string }) => {
      if (request.area === "mobile" && first) {
        first = false;
        return fail("provider_unavailable");
      }
      return ok('{"issues": ["hero wraps at 320px"], "severity": "medium"}');
    }) as unknown as Thinker;
    const panel = await runReviewPanel({ organizationId: "org", material: "x", mode: "light" }, thinker);
    expect(panel.failed).toEqual([]);
    expect(panel.notes.find((n) => n.area === "mobile")?.issues).toEqual(["hero wraps at 320px"]);
  });
});
