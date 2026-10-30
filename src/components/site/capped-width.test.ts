import { describe, expect, it } from "vitest";
import { styleToCss } from "@/components/site/CompositionRenderer";

describe("capped width", () => {
  it("lets a capped panel fill its row up to the cap instead of shrinking to its shortest label", () => {
    expect(styleToCss({ maxWidth: 1312 }, "accordion")).toMatchObject({ maxWidth: 1312, width: "100%", marginLeft: "auto" });
    expect(styleToCss({ maxWidth: 1200 }, "grid")).toMatchObject({ width: "100%" });
  });

  it("keeps text and buttons at their natural width", () => {
    expect(styleToCss({ maxWidth: 640 }, "heading").width).toBeUndefined();
    expect(styleToCss({ maxWidth: 320 }, "button").width).toBeUndefined();
  });
});
