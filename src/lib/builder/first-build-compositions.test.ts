import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/lib/ai/hall-of-fame.server", () => ({
  callBestThinker: vi.fn(async (req: { user: string }) => {
    calls.push(req.user);
    const good = { version: 1, root: { type: "stack", children: [{ type: "heading", level: 2, text: "Roof repair" }] } };
    const bad = { version: 1, root: { type: "banana" } };
    return { ok: true, model: "gpt-6-sol", costMicrocents: 1, text: JSON.stringify({ sections: { s1: good, s2: calls.length === 1 ? bad : good } }) };
  }),
}));

function fakeDb(updates: unknown[]) {
  const rows: Record<string, unknown[]> = {
    website_sections: [
      { id: "s1", page_id: "p", kind: "services", heading: "x", subheading: null, body: null, settings: {} },
      { id: "s2", page_id: "p", kind: "faq", heading: "y", subheading: null, body: null, settings: {} },
      { id: "s3", page_id: "p", kind: "quote", heading: "z", subheading: null, body: null, settings: {} },
    ],
    website_components: [],
  };
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain["select"] = () => chain;
      chain["eq"] = () => chain;
      chain["order"] = () => Promise.resolve({ data: rows[table], error: null });
      chain["update"] = (value: unknown) => {
        updates.push(value);
        const done = { eq: () => done, then: (r: (v: unknown) => void) => r({ error: null }) };
        return done;
      };
      return chain;
    },
  };
}

describe("composeFirstBuildSections", () => {
  it("turns every content section into an AI layout and repairs invalid trees", async () => {
    const { composeFirstBuildSections } = await import("./first-build-compositions.server");
    const updates: { kind: string }[] = [];
    const result = await composeFirstBuildSections({
      db: fakeDb(updates) as never,
      organizationId: "org",
      facts: { businessName: "Northline", services: ["Roof repair"] } as never,
      lookSummary: "{}",
    });
    expect(result.composed).toBe(2);
    expect(updates.every((u) => u.kind === "composition")).toBe(true);
    // Two design calls; the review panel follows (its notes here parse as empty, so no revision).
    expect(calls.filter((c) => c.includes("SECTIONS TO DESIGN"))).toHaveLength(2);
    expect(result.gateReports).toEqual([]);
    expect(calls[1]).toContain("FIX THESE PROBLEMS");
    expect(calls[0]).not.toContain('"s3"');
  });
});
