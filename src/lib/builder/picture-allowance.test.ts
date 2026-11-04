import { describe, expect, it } from "vitest";
import { MAX_PAID_PICTURE_ATTEMPTS, pictureAllowanceUsed, pictureSpendCapMicrocents, pictureUsesPremium } from "./build-spend";

const USD = 100_000_000;
describe("picture allowance per build", () => {
  it("defaults to $3 of pictures", () => expect(pictureSpendCapMicrocents({})).toBe(3 * USD));
  it("stops once $3 is spent", () => expect(pictureAllowanceUsed(5, 3 * USD, 3 * USD)).toBe(true));
  it("counts failed attempts toward the 24-attempt limit", () => {
    expect(MAX_PAID_PICTURE_ATTEMPTS).toBe(24);
    expect(pictureAllowanceUsed(24, 0, 3 * USD)).toBe(true);
    expect(pictureAllowanceUsed(23, 0, 3 * USD)).toBe(false);
  });
  it("only the first hero picture uses the premium model", () => {
    expect(pictureUsesPremium(0, true)).toBe(true);
    expect(pictureUsesPremium(1, true)).toBe(false);
    expect(pictureUsesPremium(0, false)).toBe(false);
  });
});
