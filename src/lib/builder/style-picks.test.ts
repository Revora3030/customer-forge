import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS } from "@/lib/site-font-pairings";
import { PALETTE_PRESETS } from "@/lib/builder/palette-edit";
import { blankCreativeBrief } from "@/lib/builder/first-build-contract";
import { compileAiDesignContract } from "@/lib/builder/creative-authority";
import { validateAiDesignContract } from "@/lib/builder/ai-design-contract";
import { STYLE_PICKS, ownerStyleChoice, resolvedStylePicks, styleFromProfile, styleProfilePatch } from "@/lib/builder/style-picks";

const architecture = [{
  slug: "home",
  title: "Home",
  purpose: "Introduce the business",
  primaryAction: "Contact the business",
  sections: [{ role: "introduction", layout: "editorial", intent: "explain", media: "none" as const }],
}];
const compile = (ownerStyle: ReturnType<typeof ownerStyleChoice>) => {
  const brief = blankCreativeBrief([]);
  brief.typography.display = "Ai Display";
  brief.typography.body = "Ai Body";
  brief.color.accentUse = "#ff00ff";
  brief.personality = "plainspoken";
  return compileAiDesignContract({
    businessName: "Northline",
    brief,
    architecture,
    directedBy: "test",
    conversionGoal: null,
    navigationItems: ["Home"],
    primaryAction: "Contact the business",
    ownerStyle,
  });
};

describe("style picks", () => {
  it("offers exactly three cards, each built from an existing palette preset and font pairing", () => {
    expect(STYLE_PICKS).toHaveLength(3);
    const resolved = resolvedStylePicks();
    expect(resolved).toHaveLength(3);
    for (const pick of resolved) {
      expect(PALETTE_PRESETS).toContain(pick.palette);
      expect(FONT_PAIRINGS).toContain(pick.pairing);
      expect(pick.feel.length).toBeGreaterThan(10);
    }
    expect(new Set(resolved.map((pick) => pick.palette.id)).size).toBe(3);
    expect(new Set(resolved.map((pick) => pick.pairing.id)).size).toBe(3);
  });

  it("writes only existing business-profile columns, so no migration is needed", () => {
    const patch = styleProfilePatch(resolvedStylePicks()[1]!);
    expect(Object.keys(patch).sort()).toEqual(["accent_color", "font_preference", "primary_color", "secondary_color"]);
    expect(patch["font_preference"]).toBe("Fraunces|Commissioner");
    for (const key of ["primary_color", "secondary_color", "accent_color"]) expect(patch[key]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("recognises a saved pick again, and nothing else", () => {
    for (const pick of resolvedStylePicks()) expect(styleFromProfile(styleProfilePatch(pick))?.id).toBe(pick.id);
    expect(styleFromProfile(null)).toBeNull();
    expect(styleFromProfile({})).toBeNull();
    // Skipped: nothing chosen, the AI decides.
    expect(styleFromProfile({ primary_color: null, secondary_color: null, accent_color: null, font_preference: null })).toBeNull();
    // Owner edited a colour by hand afterwards: no longer a pick.
    expect(styleFromProfile({ ...styleProfilePatch(resolvedStylePicks()[0]!), primary_color: "#123456" })).toBeNull();
    // Right colours but a different font.
    expect(styleFromProfile({ ...styleProfilePatch(resolvedStylePicks()[0]!), font_preference: "Space Grotesk" })).toBeNull();
  });
});

describe("the chosen look reaches the AI design contract", () => {
  it("overrides the AI's fonts and colours and records the feel, end to end from the saved profile", () => {
    const pick = resolvedStylePicks()[2]!;
    const saved = styleProfilePatch(pick);
    const contract = compile(ownerStyleChoice(styleFromProfile(saved)));
    expect(contract.typography.display).toBe("Cormorant Garamond");
    expect(contract.typography.body).toBe("Manrope");
    expect(contract.color.background).toBe(pick.palette.secondary);
    expect(contract.color.accent).toBe(pick.palette.primary);
    expect(contract.color.extras).toEqual({ structural: pick.palette.accent });
    expect(contract.identity.personality).toContain("plainspoken");
    expect(contract.identity.personality).toContain(pick.feel);
    expect(contract.ownerStyle).toEqual({ id: pick.id, name: pick.name, feel: pick.feel });
    expect(validateAiDesignContract(contract).valid).toBe(true);
  });

  it("leaves the AI's own design untouched when the owner skipped", () => {
    const contract = compile(ownerStyleChoice(styleFromProfile({ primary_color: null, font_preference: null })));
    expect(contract.typography.display).toBe("Ai Display");
    expect(contract.typography.body).toBe("Ai Body");
    expect(contract.color.accent).toBe("#ff00ff");
    expect(contract.ownerStyle).toBeUndefined();
    expect(contract.identity.personality).toBe("plainspoken");
  });
});
