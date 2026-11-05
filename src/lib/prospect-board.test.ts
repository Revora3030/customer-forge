import { describe, expect, it } from "vitest";
import { buildBoard } from "./prospect-board";

describe("prospect board", () => {
  it("places each prospect in the furthest proven stage", () => {
    const b = buildBoard({
      demos: [
        { organizationId: "a", name: "A" },
        { organizationId: "b", name: "B" },
        { organizationId: "c", name: "C" },
        { organizationId: "d", name: "D" },
        { organizationId: "e", name: "" },
      ],
      leads: [
        { id: "l1", name: "Lead", status: "pending", organizationId: null },
        { id: "l2", name: "C", status: "approved", organizationId: "c" },
        { id: "l3", name: "X", status: "blocked", organizationId: null },
      ],
      builtOrgIds: ["b", "c"],
      sentOrgIds: ["d", "a"],
      repliedOrgIds: ["a"],
    });
    expect(b.replied.map((c) => c.name)).toEqual(["A"]);
    expect(b.sent.map((c) => c.name)).toEqual(["D"]);
    expect(b.approved.map((c) => c.name)).toEqual(["C"]);
    expect(b.demo_built.map((c) => c.name)).toEqual(["B"]);
    expect(b.found.map((c) => [c.name, c.leadId])).toEqual([["unknown", null], ["Lead", "l1"]]);
  });
});
