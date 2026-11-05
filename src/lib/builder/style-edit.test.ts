import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS } from "@/lib/site-font-pairings";
import { readBuilderMessage, PREVIEW_BRIDGE_SOURCE } from "@/lib/builder/preview-bridge";
import {
  densityChoiceOf,
  pairingIdOf,
  radiusChoiceOf,
  readSiteStyle,
  sameStyle,
  styleFromStored,
  stylePreference,
  stylePreviewPatch,
  styleTokens,
} from "@/lib/builder/style-edit";

describe("token inspector v2 choices", () => {
  it("only accepts curated font pairs and known corner/spacing choices", () => {
    expect(readSiteStyle({ pairingId: "Comic Sans|Papyrus", radius: "round", density: 7 })).toEqual(
      { pairingId: null, radius: null, density: null },
    );
    expect(
      readSiteStyle({ pairingId: FONT_PAIRINGS[0]!.id, radius: "pill", density: "airy" }),
    ).toEqual({ pairingId: FONT_PAIRINGS[0]!.id, radius: "pill", density: "airy" });
    expect(readSiteStyle(null)).toEqual({ pairingId: null, radius: null, density: null });
  });

  it("maps choices onto the existing design tokens and font preference", () => {
    expect(styleTokens({ pairingId: null, radius: "sharp", density: "compact" })).toEqual({
      radius: 0,
      buttonRadius: 0,
      space: 0.8,
    });
    expect(styleTokens({ pairingId: null, radius: "pill", density: null })).toEqual({
      radius: 16,
      buttonRadius: 999,
    });
    expect(styleTokens({ pairingId: null, radius: null, density: null })).toEqual({});
    const pair = FONT_PAIRINGS[1]!;
    expect(stylePreference({ pairingId: pair.id, radius: null, density: null })).toBe(
      `${pair.display}|${pair.body}`,
    );
    expect(stylePreference({ pairingId: null, radius: null, density: null })).toBeNull();
  });

  it("round-trips saved values back to the same choices", () => {
    for (const radius of ["sharp", "subtle", "pill"] as const)
      expect(radiusChoiceOf(styleTokens({ pairingId: null, radius, density: null }))).toBe(radius);
    for (const density of ["compact", "comfortable", "airy"] as const)
      expect(densityChoiceOf(styleTokens({ pairingId: null, radius: null, density }))).toBe(
        density,
      );
    expect(radiusChoiceOf(null)).toBeNull();
    expect(densityChoiceOf({})).toBeNull();
    const pair = FONT_PAIRINGS[2]!;
    expect(pairingIdOf(`${pair.display}|${pair.body}`)).toBe(pair.id);
    expect(pairingIdOf("Space Grotesk")).toBeNull();
    expect(
      sameStyle(styleFromStored(null, null), { pairingId: null, radius: null, density: null }),
    ).toBe(true);
  });

  it("previews with CSS variables and a Google Fonts stylesheet built from the curated pair", () => {
    const pair = FONT_PAIRINGS[0]!;
    const patch = stylePreviewPatch({ pairingId: pair.id, radius: "pill", density: "airy" });
    expect(patch.vars["--radius"]).toBe("16px");
    expect(patch.vars["--site-button-radius"]).toBe("999px");
    expect(patch.vars["--site-space"]).toBe("1.3");
    expect(patch.vars["--font-heading"]).toContain(pair.display);
    expect(patch.classes).toEqual(["rv-btn-radius"]);
    expect(patch.fontsHref).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(
      stylePreviewPatch({ pairingId: null, radius: null, density: null }).fontsHref,
    ).toBeNull();
  });

  it("the preview bridge sanitises a style patch", () => {
    const message = readBuilderMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "patch-theme",
      primary: "#1d4ed8",
      secondary: "#ffffff",
      accent: "#0369a1",
      style: { pairingId: "evil</style>", radius: "pill", density: "nope" },
    });
    expect(message).toMatchObject({
      type: "patch-theme",
      style: { pairingId: null, radius: "pill", density: null },
    });
  });
});

describe("site-theme save path", () => {
  const source = readFileSync("src/lib/builder/site-theme.functions.ts", "utf8");
  it("checks the manager role server-side before writing fonts or tokens", () => {
    const role = source.indexOf(
      'requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager")',
    );
    expect(role).toBeGreaterThan(-1);
    expect(source.indexOf("font_preference: stylePreference")).toBeGreaterThan(role);
    expect(source.indexOf("writeDesignTokens(")).toBeGreaterThan(role);
    expect(source).toContain("readSiteStyle(input.style)");
  });
  it("adds no new table: fonts go to business_profiles, corners/spacing to website_settings.generation", () => {
    expect(source).toContain('.from("website_settings")');
    expect(source).not.toMatch(/\.from\("(?!business_profiles|website_settings)/);
  });
});

describe("PreviewThemeEditor v2", () => {
  const source = readFileSync("src/components/app/PreviewThemeEditor.tsx", "utf8");
  it("offers only FONT_PAIRINGS, keeps WCAG warnings and reverts the preview on cancel/reset", () => {
    expect(source).toContain("FONT_PAIRINGS.map");
    expect(source).toContain('data-testid="preview-theme-warnings"');
    expect(source).toMatch(
      /const discard = \(\) => \{[\s\S]*?setStyleDraft\(null\);[\s\S]*?previewRef\.current\(null\);/,
    );
    expect(source).toContain("if (!next && changed) discard();");
  });
});

describe("font preload (New Bot 4 claim) is unchanged", () => {
  it("client sites still preload their one fonts stylesheet; the editor only adds a preview-frame link", () => {
    const head = readFileSync("src/lib/site-head.ts", "utf8");
    expect(head).toContain('{ rel: "preload", as: "style", href: fontsHref }');
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain("[dmSans400, dmSans600, instrumentSerif400, spaceGrotesk700]");
    const bridge = readFileSync("src/components/site/PreviewSelectBridge.tsx", "utf8");
    expect(bridge).toContain('link.id = "rv-preview-fonts"');
  });
});
