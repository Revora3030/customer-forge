import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { blankDesignFingerprint } from "./design-fingerprint";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
const production = files("src");

describe("creative authority firewall", () => {
  it("no production code imports the template gallery or archetype recipes", () => {
    const offenders = production.filter((f) => {
      if (f.endsWith("template-gallery.ts") || f.endsWith("site-archetypes.ts")) return false;
      return /from ["'][^"']*(template-gallery|site-archetypes)["']/.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("deleted rule-based creative modules stay deleted", () => {
    const gone = [
      "src/lib/site-archetypes.ts",
      "src/lib/visual-palette.ts",
      "src/lib/builder/template-gallery.ts",
      "src/lib/builder/conversion-blueprint.ts",
      "src/lib/builder/site-conversion-architecture.ts",
      "src/lib/builder/sitewide-cta.ts",
      "src/lib/builder/copy-depth.ts",
    ];
    const present = gone.filter((f) => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });
    expect(present).toEqual([]);
  });

  it("a cut-off model answer is a failure that hands over, never a partial plan", () => {
    const src = readFileSync("src/lib/ai/luna.server.ts", "utf8");
    expect(src).toMatch(/readFinishReason\(payload\) === "length"/);
    const thinker = readFileSync("src/lib/ai/hall-of-fame.server.ts", "utf8");
    const body = thinker.slice(thinker.indexOf("async function callBestThinkerInner"));
    // The only fallback after the paid lane is the free model squad.
    expect(body).toContain("callHallOfFame(");
    expect(body).not.toMatch(/fingerprint|archetype|template|preset/i);
  });

  it("the fingerprint can no longer pick designs from finite pools", () => {
    const neutral = blankDesignFingerprint();
    const a = blankDesignFingerprint();
    const b = blankDesignFingerprint();
    for (const fp of [a, b]) {
      expect({ ...fp, id: neutral.id, seed: neutral.seed, rejected: neutral.rejected }).toEqual(neutral);
    }
  });
});

describe("upgrade rule passes", () => {
  it("no rule-based motion or story pass exists; Motion goes through the AI redesign", async () => {
    const src = readFileSync("src/lib/site-upgrade.functions.ts", "utf8");
    expect(src).not.toMatch(/applyMotionPack|applyStoryPass|motion-pack|story-pass/);
    const panel = readFileSync("src/components/app/SiteUpgradePanel.tsx", "utf8");
    expect(panel).toMatch(/applySiteWideRedesign\(\{ data: \{ organizationId, instruction: ask \} \}\)/);
    const redesign = src.slice(src.indexOf("export const applySiteWideRedesign"), src.indexOf("export const reviewPageScreenshot"));
    expect(redesign).not.toMatch(/planMotionAssignments\(/);
  });
});

describe("first build", () => {
  it("never consumes industry page/section recipes or conversion placements", () => {
    for (const f of [
      "src/lib/site-engine.worker.server.ts",
      "src/lib/builder/collective-first-build.server.ts",
      "src/lib/builder/first-build-safety.ts",
      "src/lib/builder/first-build-images.server.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/industry\.homeSections|industry\.pageSlugs|conversion\.placements/);
    }
  });
});

describe("request understanding and design fallbacks", () => {
  it("the keyword intent translator is gone from production", () => {
    const offenders = production.filter((f) => /intent-translator|translateIntent\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no-model design fallback carries no layout, type, palette or story opinion", async () => {
    const { designWithoutModel } = await import("@/lib/agent/design-brief.server");
    for (const trade of ["plumbing", "dental", "wedding photography", null]) {
      const d = designWithoutModel(trade);
      expect([d.goal, d.layout, d.typography, d.palette, d.motion]).toEqual(["", "", "", "", ""]);
      expect(d.story).toEqual([]);
    }
  }, 20_000);

  it("no-model understanding passes the owner's words through unchanged", async () => {
    const { understandWithoutModel } = await import("@/lib/agent/understanding.server");
    const u = understandWithoutModel("make it feel like a moody jazz club");
    expect(u.goal).toBe("make it feel like a moody jazz club");
    expect(u.tasks[0]?.brief).toBe("make it feel like a moody jazz club");
  });
});

describe("old design layer is fully removed", () => {
  it("every retired module stays deleted", () => {
    for (const f of [
      "src/lib/builder/industry.ts",
      "src/lib/builder/interpreter.ts",
      "src/lib/builder/visual-intelligence.ts",
      "src/lib/builder/autopilot.ts",
      "src/lib/builder/context-targeting.ts",
      "src/lib/builder/motion-pack.ts",
      "src/lib/builder/story-pass.ts",
      "src/lib/builder/first-build-creative.ts",
      "src/lib/builder/creative-brief.ts",
      "src/lib/builder/executable-creative.ts",
      "src/lib/builder/site-design-system.ts",
      "src/lib/builder/image-layout-intelligence.ts",
      "src/lib/builder/navigation-intelligence.ts",
      "src/lib/builder/site-campaign.ts",
      "src/lib/builder/asset-intelligence.ts",
      "src/lib/hidden-gems.ts",
      "src/lib/media/generative-art.ts",
    ]) {
      expect(() => statSync(f)).toThrow();
    }
  });

  it("the saved design record has no style pools or pickers", () => {
    const src = readFileSync("src/lib/builder/design-fingerprint.ts", "utf8");
    expect(src).not.toMatch(/_COMPOSITIONS|_SYSTEMS|_LAYOUTS|fingerprintSeed|createDesignFingerprint|sectionDesignFromFingerprint|function pick/);
  });

  it("Sol's first-build creative pass has no fixed vocabulary", () => {
    const src = readFileSync("src/lib/builder/collective-first-build.server.ts", "utf8");
    expect(src).not.toMatch(/Choose only from the supplied design vocabulary|not in the supported design vocabulary/);
  });

  it("screenshot references never map keywords to styles", () => {
    const src = readFileSync("src/lib/builder/screenshot-reference.ts", "utf8");
    expect(src).not.toMatch(/pickReferencePatch|allowedPatch|alignCreativeBriefToFingerprint/);
  });
});

describe("no built-in looks remain", () => {
  it("the preset style library stays deleted", () => {
    expect(() => statSync("src/lib/design-directions.ts")).toThrow();
    const offenders = production.filter((f) => /DESIGN_DIRECTIONS|recommendDirections|design-directions/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("AI prompts never restrict fonts to a fixed list", () => {
    for (const f of ["src/lib/site-agent.server.ts", "src/lib/builder/ai-agent-plan.server.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Object\.keys\(SITE_HEADING_FONTS\)/);
    }
  });

  it("new clients and onboarding start with no built-in colours", () => {
    expect(readFileSync("src/components/admin/NewClientDialog.tsx", "utf8")).not.toMatch(/"#34d399"|"#0f172a"|"#fbbf24"/);
    expect(readFileSync("src/routes/_authenticated/onboarding.tsx", "utf8")).not.toMatch(/"#0B0B0C"|"#C9A227"/);
    expect(readFileSync("src/lib/site-engine.worker.server.ts", "utf8")).not.toMatch(/#34d399/i);
  });

  it("the rule-based layer designer and default effect map are gone", () => {
    const vc = readFileSync("src/lib/visual-composition.ts", "utf8");
    expect(vc).not.toMatch(/inventComposition|interpretVisualPrompt|CREATIVE_COMMANDS|seedPromptFor|originalityScore|RECIPES/);
    expect(readFileSync("src/lib/site-effects.ts", "utf8")).not.toMatch(/RECOMMENDED_SECTION_EFFECT/);
  });

  it("an AI-written background is accepted and unsafe values are dropped", async () => {
    const { safeBackdropSpec } = await import("@/lib/site-effects");
    const spec = safeBackdropSpec({ drift: "slow", layers: [{ shape: "radial", colors: ["#112233", "red;}"], size: 999, opacity: 90 }] });
    expect(spec?.layers[0]?.colors).toEqual(["#112233"]);
    expect(spec?.layers[0]?.size).toBe(400);
    expect(spec?.layers[0]?.opacity).toBe(80);
    expect(safeBackdropSpec({ layers: [{ colors: ["url(x)"] }] })).toBeNull();
  });

  it("an authored direction with no valid colours or font is rejected, never replaced", async () => {
    const { parseAuthoredDirection } = await import("@/lib/authored-direction");
    expect(parseAuthoredDirection({ name: "x", primary: "blue", secondary: "#000000", accent: "#ffffff", font: "Inter" })).toBeNull();
    expect(parseAuthoredDirection({ name: "x", primary: "#111111", secondary: "#000000", accent: "#ffffff", font: "<script>" })).toBeNull();
  });
});

describe("root-level clean-up (Sep 25)", () => {
  it("no zero-cost switch can turn the AI team off", () => {
    const offenders = production.filter((f) => /ZERO_AI_COST_MODE|zeroAiCostMode|zeroCostBlocked/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the unused keyword intent resolver stays deleted", () => {
    expect(() => statSync("src/lib/builder/intent-resolution.ts")).toThrow();
  });

  it("audit gaps are handed to the AI team, never inserted as a fixed section", () => {
    const src = readFileSync("src/lib/auto-upgrade.hooks.ts", "utf8");
    expect(src).not.toMatch(/from\("website_sections"\)\s*\.insert/);
    expect(src).toMatch(/runWebsiteTask\(/);
  });
});

describe("no fixed page or section recipes", () => {
  it("the goal-to-sections recipe and fixed site outline stay deleted", () => {
    expect(() => statSync("src/lib/builder/prompt-site-blueprint.ts")).toThrow();
    const offenders = production.filter((f) => /GOAL_SECTIONS|createPromptSiteBlueprint/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("review repairs never author a design", () => {
  it("design findings are handed to the AI team, not mapped to a fixed look", async () => {
    const { visionRepairs, aiDesignInstruction } = await import("./vision-review");
    const findings = [
      { kind: "low_contrast_text", where: "Hero", detail: "Grey text on grey" },
      { kind: "cta_not_prominent", where: "Offer", detail: "Button blends in" },
      { kind: "cramped_spacing", where: "Services", detail: "Tight" },
    ] as never;
    const { repairs } = visionRepairs({ score: 60, verdict: "", findings, discarded: 0, clean: false } as never);
    expect(repairs).toEqual([]);
    expect(aiDesignInstruction(findings, "Home", 390)).toMatch(/Redesign/);
    const upgrade = readFileSync("src/lib/site-upgrade.functions.ts", "utf8");
    expect(upgrade).not.toMatch(/"high-contrast"|"gold_glow"/);
  });

  it("page search titles are written by the AI team", () => {
    const src = readFileSync("src/lib/auto-upgrade.hooks.ts", "utf8");
    expect(src).not.toMatch(/kind === "page_seo" \|\| proposal\.kind === "page_index"/);
  });
});

describe("no canned upgrade engine", () => {
  it("the fixed per-section effect and wording upgrade studio stays deleted", () => {
    expect(() => statSync("src/lib/upgrade-studio.ts")).toThrow();
    const offenders = production.filter((f) => /upgrade-studio|scanForUpgrades|effectFor\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
