import { describe, expect, it } from "vitest";
import { normalise, normaliseSubjectOnly } from "./normalize";

describe("Revora language normaliser", () => {
  it("understands casual conversion requests", () => {
    const result = normalise("can u make my site look expensive and get me more customers?");
    expect(result.text).toContain("premium");
    expect(result.text).toContain("conversion");
    expect(result.text).toContain("leads");
  });

  it("understands mobile-first language", () => {
    const result = normalise("make it work great on phones and load faster");
    expect(result.text).toContain("mobile");
    expect(result.text).toContain("speed");
  });

  it("carries the subject into short follow-ups", () => {
    const result = normalise("make it bigger", ["Make the hero more premium and add a stronger CTA"]);
    expect(result.carried).toContain("hero");
    expect(result.text).toContain("hero");
  });

  it("recognizes repeated-change language", () => {
    const result = normalise("do that everywhere");
    expect(result.text).toContain("on every page");
  });

  it("extracts multiple useful subjects from prior messages", () => {
    expect(normaliseSubjectOnly("Improve the header, navigation, photos and mobile layout")).toBe(
      "header navigation photos mobile",
    );
  });

  it("keeps the original owner wording intact", () => {
    const result = normalise("pls make my website premium!!!");
    expect(result.original).toBe("pls make my website premium!!!");
  });
});
