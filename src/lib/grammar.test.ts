import { describe, expect, it } from "vitest";
import { articleFor, lowerPhrase, withArticle } from "./grammar";

describe("grammar helpers", () => {
  it("picks a/an by sound", () => {
    expect(withArticle("Auto Detailing")).toBe("an auto detailing");
    expect(withArticle("HVAC")).toBe("an HVAC");
    expect(withArticle("Electrical")).toBe("an electrical");
    expect(withArticle("Plumbing")).toBe("a plumbing");
    expect(withArticle("Roofing")).toBe("a roofing");
    expect(withArticle("DIY website builder")).toBe("a DIY website builder");
    expect(withArticle("RV repair")).toBe("an RV repair");
    expect(articleFor("Uniform shop")).toBe("a");
    expect(articleFor("Hour")).toBe("an");
  });
  it("keeps acronyms when lower-casing", () => {
    expect(lowerPhrase("DIY website builder")).toBe("DIY website builder");
    expect(lowerPhrase("Marketing Agency")).toBe("marketing agency");
    expect(lowerPhrase("HVAC")).toBe("HVAC");
  });
});
