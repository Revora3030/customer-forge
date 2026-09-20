import { describe, expect, it } from "vitest";
import { brandLockMode, brandLockNote } from "./brand-lock";

describe("brandLockMode", () => {
  it("lets a redesign request replace the saved palette", () => {
    expect(
      brandLockMode("Redesign my whole website to feel premium and designer-grade"),
    ).toBe("restyle");
    expect(brandLockMode("pick a look that fits my industry")).toBe("restyle");
    expect(brandLockMode("make it premium")).toBe("restyle");
    expect(brandLockMode("this looks generic, give it a fresh look")).toBe("restyle");
  });

  it("keeps the owner's colours for ordinary edits", () => {
    expect(brandLockMode("change the hero headline to Same day repairs")).toBe(
      "keep_owner_colours",
    );
    expect(brandLockMode("")).toBe("keep_owner_colours");
    expect(brandLockMode(null)).toBe("keep_owner_colours");
  });

  it("obeys an explicit keep-my-colours instruction even inside a redesign", () => {
    expect(brandLockMode("Redesign the whole site but keep my colours")).toBe(
      "keep_owner_colours",
    );
    expect(brandLockMode("make it premium, same colors please")).toBe("keep_owner_colours");
  });

  it("explains the decision in plain language", () => {
    expect(brandLockNote("restyle")).toContain("new look");
    expect(brandLockNote("keep_owner_colours")).toContain("kept exactly");
  });
});
