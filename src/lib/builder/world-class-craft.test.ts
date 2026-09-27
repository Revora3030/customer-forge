import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMON_AI_DEFAULTS,
  DISTINCTIVENESS_REVIEW_BRIEF,
  VISUAL_CRAFT_REVIEW_BRIEF,
  craftBarPrompt,
  type CraftRole,
} from "@/lib/builder/world-class-craft";
import { panelFor } from "@/lib/builder/review-panel.server";

const ROLES: CraftRole[] = [
  "creative_direction",
  "brand_identity",
  "page_architecture",
  "layout",
  "polish",
  "copy",
  "redesign",
];

describe("world-class craft bar", () => {
  it("raises the bar for every role and always asks for a self-critique", () => {
    for (const role of ROLES) {
      const prompt = craftBarPrompt(role);
      expect(prompt, role).toContain("CRAFT BAR");
      expect(prompt, role).toContain("every creative choice stays yours");
      expect(prompt, role).toContain("critique your own output");
    }
  });

  it("never chooses a design: no fonts, hex colours, effects or fixed sections", () => {
    const everything = [...ROLES.map(craftBarPrompt), VISUAL_CRAFT_REVIEW_BRIEF, DISTINCTIVENESS_REVIEW_BRIEF].join(" ");
    expect(everything).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(everything).not.toMatch(/\b(Inter|Fraunces|Playfair|Roboto|Montserrat|Poppins)\b/);
    expect(everything).not.toMatch(/tilt_3d|glass"|"rise"|gold_glow/);
    expect(everything).not.toMatch(/must (include|use|start with) (a|an|the) (hero|testimonial|faq|pricing)/i);
  });

  it("frames common generated-site defaults as questions, not bans", () => {
    const prompt = craftBarPrompt("layout");
    expect(prompt).toMatch(/use one only when you can say why/);
    for (const item of COMMON_AI_DEFAULTS) expect(prompt).toContain(item);
  });

  it("is wired into every creative teammate", () => {
    const wired: Record<string, string> = {
      "src/lib/builder/collective-first-build.server.ts": 'craftBarPrompt("creative_direction")',
      "src/lib/builder/first-build-compositions.server.ts": 'craftBarPrompt("layout")',
      "src/lib/builder/edit-polish.server.ts": 'craftBarPrompt("polish")',
      "src/lib/builder/ai-brand-identity.server.ts": 'craftBarPrompt("brand_identity")',
      "src/lib/builder/ai-page-architecture.server.ts": 'craftBarPrompt("page_architecture")',
      "src/lib/builder/ai-redesign-direction.server.ts": 'craftBarPrompt("redesign")',
      "src/lib/builder/collective-sections.server.ts": 'craftBarPrompt("copy")',
    };
    for (const [file, call] of Object.entries(wired)) {
      expect(readFileSync(file, "utf8"), file).toContain(call);
    }
  });

  it("puts independent craft critics on the review panel", () => {
    const full = panelFor("full");
    const craft = full.find((r) => r.area === "visual_craft");
    const distinct = full.find((r) => r.area === "distinctiveness");
    expect(craft?.purpose).toBe("visual_review");
    expect(distinct?.purpose).toBe("design_alternative");
    expect(panelFor("light").map((r) => r.area)).toContain("visual_craft");
  });
});
