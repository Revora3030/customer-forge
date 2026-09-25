import { describe, expect, it } from "vitest";
import { validateComposition } from "@/lib/builder/composition-tree";

describe("standard CSS spellings from the AI", () => {
  it("translates px strings and two-value padding instead of refusing them", () => {
    const res = validateComposition({ version: 1, root: { type: "stack", style: { padding: "16px 32px", gap: "24px", justifyContent: "space-between" }, children: [{ type: "text", text: "Hi" }] } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tree.root.style).toMatchObject({ paddingY: 16, paddingX: 32, gap: 24, justify: "between" });
  });
  it("maps CSS font and alignment names to the schema's own keys", () => {
    const res = validateComposition({ version: 1, root: { type: "stack", style: { alignItems: "center" }, children: [{ type: "text", text: "Hi", style: { fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: "bold" } }] } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tree.root.children?.[0]?.style).toMatchObject({ font: "Fraunces", size: 18, weight: 700 });
  });
  it("still refuses values it cannot translate", () => {
    const res = validateComposition({ version: 1, root: { type: "stack", style: { padding: "calc(1vw)" }, children: [{ type: "text", text: "Hi" }] } });
    expect(res.ok).toBe(false);
  });
});
