import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-tree";

describe("composition widgets", () => {
  it("accepts known working features and rejects unknown ones", () => {
    const ok = validateComposition({ version: 1, root: { type: "stack", children: [{ type: "widget", text: "booking_form" }] } });
    expect(ok.ok).toBe(true);
    const bad = validateComposition({ version: 1, root: { type: "widget", text: "fake_form" } });
    expect(bad.ok).toBe(false);
  });
});
