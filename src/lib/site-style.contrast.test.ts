import { describe, expect, it } from "vitest";
import { surfaceInkTokens } from "./site-style";
import { contrastRatio } from "./readable-color";

describe("surfaceInkTokens", () => {
  it("gives a white card dark ink when the page ink is white (dark site)", () => {
    const tokens = surfaceInkTokens("#ffffff", "#0b0b0f");
    expect(tokens["color"]).toBe("#101114");
    expect(tokens["--foreground"]).toBe("#101114");
    expect(contrastRatio(tokens["color"]!, "#ffffff")!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens["--muted-foreground"]!, "#ffffff")!).toBeGreaterThanOrEqual(4.5);
  });

  it("gives a dark card light ink on a light site", () => {
    const tokens = surfaceInkTokens("#111827", "#ffffff");
    expect(contrastRatio(tokens["color"]!, "#111827")!).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves a card alone when the inherited ink is already readable", () => {
    expect(surfaceInkTokens("#f5f5f5", "#ffffff")).toEqual({});
  });

  it("never touches colours it cannot measure", () => {
    expect(surfaceInkTokens("var(--card)", "#000000")).toEqual({});
  });
});
