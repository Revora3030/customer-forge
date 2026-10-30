import { describe, expect, it } from "vitest";
import { countUpFrame, easeOut, formatFigure, parseCountUp, tweenValue } from "./count-up";

describe("parseCountUp", () => {
  it("reads plain stat figures", () => {
    expect(parseCountUp("500+")).toEqual({ prefix: "", value: 500, decimals: 0, grouped: false, suffix: "+" });
    expect(parseCountUp("$1,200")).toEqual({ prefix: "$", value: 1200, decimals: 0, grouped: true, suffix: "" });
    expect(parseCountUp("4.9★")).toMatchObject({ value: 4.9, decimals: 1, suffix: "★" });
    expect(parseCountUp("98%")).toMatchObject({ value: 98, suffix: "%" });
    expect(parseCountUp("12 years")).toMatchObject({ value: 12, suffix: " years" });
  });

  it("leaves anything that is not one plain figure alone", () => {
    for (const text of ["24/7", "(919) 555-0142", "+1 919", "2019-2024", "1.2.3", "Call now", "", "0", "3/4", "10 to 20", "Since 1998 in Raleigh, NC", "Since 1998", "2024"]) {
      expect(parseCountUp(text), text).toBeNull();
    }
    expect(parseCountUp(undefined)).toBeNull();
  });
});

describe("count-up frames", () => {
  it("eases and always lands on the exact authored text", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(tweenValue(10, 20, 1)).toBe(20);
    const parts = parseCountUp(" $1,200+ ")!;
    expect(countUpFrame(parts, 0, " $1,200+ ")).toBe("$0+");
    expect(countUpFrame(parts, 1, " $1,200+ ")).toBe("$1,200+");
    expect(countUpFrame(parseCountUp("4.9")!, 0.5, "4.9")).toMatch(/^\d\.\d$/);
  });

  it("formats with the authored grouping", () => {
    expect(formatFigure(12345.5, 1, true)).toBe("12,345.5");
    expect(formatFigure(12345, 0, false)).toBe("12345");
  });
});
