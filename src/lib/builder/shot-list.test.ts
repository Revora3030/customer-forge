import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blankFirstBuildDirection } from "./first-build-contract";
import { mergeCreativeRefinement, reviewCreativeProposal, shotListAt } from "./collective-first-build.server";
import { shotDirectionFor } from "./first-build-images.server";
import { readStage, writeStage } from "./job-stage-checkpoints";
import type { DnaFacts } from "@/lib/business-dna";

const facts: DnaFacts = { businessName: "Harbour Detail", industry: "Car detailing", services: ["Evening Detail"], city: "Leeds" };
const baseline = blankFirstBuildDirection({
  organizationId: "11111111-1111-4111-8111-111111111111",
  businessName: "Harbour Detail",
  industry: "Car detailing",
  description: null,
  city: "Leeds",
  state: null,
  serviceArea: null,
  phone: null,
  email: null,
  yearsInBusiness: null,
  services: [{ name: "Evening Detail" }],
  goals: [],
  conversionGoal: null,
  photoCount: 0,
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
});

const shot = (section: string, extra: Record<string, unknown> = {}) => ({
  section,
  setting: "a wet harbour road after rain",
  light: "low amber sunset with neon reflections",
  cameraAngle: "low three-quarter, 35mm",
  mood: "quiet anticipation",
  paletteTieIn: "deep ink shadows with the site's coral accent in reflections",
  copySpace: "calm sky across the upper left third",
  ...extra,
});

describe("shot list: AI-authored per-section art direction", () => {
  it("starts empty — no scene, light or angle is ever seeded", () => {
    expect(baseline.brief.shotList).toEqual({ continuity: "", sections: [] });
  });

  it("keeps complete entries in the AI's own words and refuses incomplete or duplicate ones", () => {
    const { shotList, rejected } = shotListAt({
      continuity: "one golden-hour evening, warm film grade",
      sections: [shot("Hero"), shot("hero"), shot("services", { light: "" }), shot("story")],
    }, facts);
    expect(shotList?.continuity).toBe("one golden-hour evening, warm film grade");
    expect(shotList?.sections.map((s) => s.section)).toEqual(["hero", "story"]);
    expect(shotList?.sections[0]?.paletteTieIn).toContain("coral accent");
    expect(rejected.some((r) => /setting, light, cameraAngle and mood/.test(r.reason))).toBe(true);
  });

  it("refuses direction that tries to state proof or unsupported claims", () => {
    const { shotList, rejected } = shotListAt({ sections: [shot("hero", { mood: "award-winning five-star results" })] }, facts);
    expect(shotList).toBeNull();
    expect(rejected[0]?.field).toBe("brief.shotList.sections[0]");
  });

  it("travels through the creative-direction safety review into the merged brief", () => {
    const gated = reviewCreativeProposal({ proposal: { brief: { concept: "Harbour nights", shotList: { continuity: "one evening", sections: [shot("hero")] } } }, facts, baseline });
    expect(gated.accepted.brief?.shotList?.sections).toHaveLength(1);
    const merged = mergeCreativeRefinement(baseline, gated.accepted);
    expect(merged.brief.shotList?.sections[0]?.section).toBe("hero");
  });

  it("is stored with the job's digest-matched, job-scoped stage checkpoint so retries resume it", () => {
    const merged = mergeCreativeRefinement(baseline, { brief: { shotList: { continuity: "one evening", sections: [shot("hero")] } } });
    const inputs = { facts, look: "x" };
    const stored = writeStage(null, "job-1", "refined", inputs, { creative: merged });
    expect(readStage<{ creative: typeof merged }>(stored, "job-1", "refined", inputs)?.creative.brief.shotList?.sections[0]?.light).toContain("amber");
    expect(readStage(stored, "job-2", "refined", inputs)).toBeNull();
    expect(readStage(stored, "job-1", "refined", { ...inputs, look: "y" })).toBeNull();
  });
});

describe("shot list feeds the existing picture prompt path", () => {
  const creative = mergeCreativeRefinement(baseline, {
    brief: { shotList: { continuity: "one golden-hour evening", sections: [shot("hero"), shot("services", { setting: "a lit detailing bay" })] } },
  });

  it("gives each picture its section's direction plus the site-wide continuity", () => {
    const hero = shotDirectionFor(creative, { slot: "opening-coupe", placement: ["hero"] });
    expect(hero).toContain("Scene direction for the hero section");
    expect(hero).toContain("camera angle low three-quarter, 35mm");
    expect(hero).toContain("Palette tie-in:");
    expect(hero).toContain("Site-wide continuity: one golden-hour evening.");
    expect(shotDirectionFor(creative, { slot: "bay", placement: ["services"] })).toContain("a lit detailing bay");
  });

  it("falls back to continuity only, and to nothing for briefs without a shot list", () => {
    expect(shotDirectionFor(creative, { slot: "faq", placement: ["faq"] })).toBe("Site-wide continuity: one golden-hour evening.");
    expect(shotDirectionFor(baseline, { slot: "hero", placement: ["hero"] })).toBe("");
  });

  it("is used inside the one image-generation prompt (no second model or reservation path)", () => {
    const source = readFileSync(resolve(__dirname, "first-build-images.server.ts"), "utf8");
    expect(source).toMatch(/shotDirectionFor\(input\.creative, shot\),\n\s+artDirectionNote\(input\.creative, shot\)/);
    const collective = readFileSync(resolve(__dirname, "collective-first-build.server.ts"), "utf8");
    expect(collective).toContain("brief.shotList is your art-direction shot list");
    expect(collective).toContain('"shotList",');
  });
});
