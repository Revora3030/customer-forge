import { describe, expect, it } from "vitest";
import { blankCreativeBrief } from "@/lib/builder/first-build-contract";
import { compileAiDesignContract, recoverVisualConcept } from "@/lib/builder/creative-authority";

describe("creative concept recovery", () => {
  it("recovers a missing concept from existing authored brief signals", () => {
    const brief = blankCreativeBrief([]);
    brief.concept = "   ";
    brief.photography.language = "editorial photography";
    brief.backgroundTreatment = "layered charcoal surfaces";
    const concept = recoverVisualConcept(brief);
    expect(concept).toContain("editorial photography");
    expect(concept).toContain("layered charcoal surfaces");
  });

  it("compiles a safe concept when the creative model leaves it blank", () => {
    const brief = blankCreativeBrief([]);
    const contract = compileAiDesignContract({
      businessName: "Northline",
      brief,
      architecture: [{
        slug: "home",
        title: "Home",
        purpose: "Introduce the verified business and its services",
        primaryAction: "Contact the business",
        sections: [{ role: "introduction", layout: "editorial", intent: "explain the service", media: "none" }],
      }],
      directedBy: "free-model-squad",
      conversionGoal: null,
      navigationItems: ["Home"],
      primaryAction: "Contact the business",
    });
    expect(contract.identity.concept.trim().length).toBeGreaterThan(0);
    expect(contract.identity.concept).toContain("accessible");
  });
});
