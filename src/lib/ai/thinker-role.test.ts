import { describe, expect, it } from "vitest";
import { roleForPurpose } from "./thinker-role";

describe("purpose-aware model role routing", () => {
  it("sends code repair, markup, accessibility, and performance work to the coding roster", () => {
    expect(roleForPurpose("repair_plan")).toBe("coding");
    expect(roleForPurpose("markup_review")).toBe("coding");
    expect(roleForPurpose("accessibility_audit")).toBe("coding");
    expect(roleForPurpose("performance_audit")).toBe("coding");
  });

  it("routes visual and responsive inspection to the vision roster", () => {
    expect(roleForPurpose("visual_review")).toBe("vision");
    expect(roleForPurpose("whole_site_review")).toBe("vision");
    expect(roleForPurpose("site_consistency_audit")).toBe("vision");
    expect(roleForPurpose("mobile_responsiveness_audit")).toBe("vision");
    expect(roleForPurpose("conversion_friction_audit")).toBe("vision");
  });

  it("keeps creative direction on design and routine work on fast", () => {
    expect(roleForPurpose("creative_direction")).toBe("design");
    expect(roleForPurpose("design_alternative")).toBe("design");
    expect(roleForPurpose("page_planning")).toBe("design");
    expect(roleForPurpose("intent")).toBe("fast");
    expect(roleForPurpose("extraction")).toBe("fast");
    expect(roleForPurpose("classification")).toBe("fast");
    expect(roleForPurpose("rewrite")).toBe("fast");
    expect(roleForPurpose("small_edit")).toBe("fast");
    expect(roleForPurpose("metadata")).toBe("fast");
  });

  it("keeps deep reasoning and independent final review on the primary roster", () => {
    expect(roleForPurpose("information_architecture")).toBe("primary");
    expect(roleForPurpose("conversion_architecture")).toBe("primary");
    expect(roleForPurpose("repair_priority")).toBe("primary");
    expect(roleForPurpose("adversarial_review")).toBe("primary");
    expect(roleForPurpose("final_review")).toBe("primary");
    expect(roleForPurpose("content_quality_review")).toBe("primary");
  });
});
