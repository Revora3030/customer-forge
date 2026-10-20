import { describe, expect, it } from "vitest";
import { colourField } from "@/lib/builder/ai-brand-identity.server";

describe("colourField", () => {
  it("reads colours the AI nested in a palette or as {hex}", () => {
    expect(colourField({ palette: { primary: "#112233" } }, "primary")).toBe("#112233");
    expect(colourField({ primary: { hex: "#abcdef" } }, "primary")).toBe("#abcdef");
    expect(colourField({ colors: {} }, "secondary")).toBeNull();
  });
});
