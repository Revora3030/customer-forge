import { describe, expect, it } from "vitest";
import { domainOwner, SPECIALIST_SIX, specialistById } from "./specialists";

describe("GPT core six are first-class specialists", () => {
  it("registers every core model", () => {
    const models = SPECIALIST_SIX.map((s) => s.model);
    for (const m of ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"])
      expect(models).toContain(m);
  });

  it("routes new lanes to GPT-5.6 Sol and Luna", () => {
    expect(domainOwner("final_review")?.model).toBe("gpt-5.6-sol");
    expect(domainOwner("schema_markup")?.model).toBe("gpt-5.6-luna");
    expect(domainOwner("completeness_check")?.model).toBe("gpt-5.6-luna");
  });

  it("keeps creative authority with GPT-6 Sol", () => {
    expect(domainOwner("creative_direction")?.model).toBe("gpt-6-sol");
    expect(specialistById("sol56").domains).not.toContain("creative_direction");
  });
});
