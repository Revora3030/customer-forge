import { describe, expect, it } from "vitest";
import { stripBusinessSuffix } from "./website-content";

describe("menu labels keep words that are not the business name suffix", () => {
  it("drops the business name and location from SEO-style titles", () => {
    expect(stripBusinessSuffix("About Elite mobile detail | Raleigh, NC", "Elite mobile detail")).toBe("About");
    expect(stripBusinessSuffix("About Elite mobile detail", "Elite mobile detail")).toBe("About");
  });

  it("keeps a label where the name is part of a longer phrase", () => {
    expect(stripBusinessSuffix("Meet Acme Plumbing Team", "Acme Plumbing")).toBe("Meet Acme Plumbing Team");
  });
});
