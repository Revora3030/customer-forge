import { describe, expect, it } from "vitest";
import { metaDescription } from "./seo";

describe("metaDescription", () => {
  it("leaves short descriptions untouched", () => {
    expect(metaDescription("Short and sweet.")).toBe("Short and sweet.");
  });

  it("trims long copy at a word boundary within the search snippet limit", () => {
    const long =
      "Revora builds Texas service businesses a complete customer acquisition system — website, instant quotes, online booking, CRM and follow-up. Serving Houston, Dallas, Austin and the whole state.";
    const out = metaDescription(long);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith("…")).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});
