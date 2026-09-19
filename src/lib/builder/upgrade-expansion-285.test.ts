import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { EXPANSION_285, EXPANSION_285_COUNT, audit285Expansion } from "./upgrade-expansion-285";

const context = { pages: [{ id: "home", slug: "/", title: "Home", kind: "home", sections: [] }] } as unknown as AgentContext;

describe("285-upgrade expansion", () => {
  it("contains exactly 285 unique capabilities", () => {
    expect(EXPANSION_285_COUNT).toBe(285);
    expect(EXPANSION_285).toHaveLength(285);
    expect(new Set(EXPANSION_285.map((u) => u.id)).size).toBe(285);
    expect(new Set(EXPANSION_285.map((u) => u.name)).size).toBe(285);
  });
  it("keeps runtime evidence separate from deterministic planning", () => {
    const audit = audit285Expansion(context, "make the site premium secure fast and accessible");
    expect(audit.total).toBe(285);
    expect(audit.active.length).toBeGreaterThan(0);
    expect(audit.runtimeRequired.length).toBeGreaterThan(0);
  });
});
