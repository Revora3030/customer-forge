import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS, pickFontPairing, resolveSiteFont, siteFontFor } from "@/lib/site-font-pairings";
import { compositionFonts, siteFontsHref, siteHeadingFont } from "@/lib/site-theme";
import { TRADE_BLUEPRINTS } from "@/lib/builder/trade-blueprints";

describe("curated font pairings", () => {
  it("offers 8–12 distinct non-generic pairings", () => {
    expect(FONT_PAIRINGS.length).toBeGreaterThanOrEqual(8);
    expect(FONT_PAIRINGS.length).toBeLessThanOrEqual(12);
    expect(new Set(FONT_PAIRINGS.map((p) => p.display)).size).toBe(FONT_PAIRINGS.length);
    for (const p of FONT_PAIRINGS) {
      expect(["Space Grotesk", "Inter", "DM Sans", "Roboto"]).not.toContain(p.display);
      expect(["Space Grotesk", "Inter", "DM Sans", "Roboto"]).not.toContain(p.body);
    }
  });

  it("gives every trade blueprint at least two suitable pairings", () => {
    for (const b of TRADE_BLUEPRINTS) {
      expect(FONT_PAIRINGS.filter((p) => p.niches.includes(b.key)).length, b.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("picks deterministically per site and niche, from the niche's pool", () => {
    const a = pickFontPairing("org-1", "plumbing");
    expect(pickFontPairing("org-1", "plumbing")).toBe(a);
    expect(a.niches).toContain("plumbing");
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickFontPairing(`org-${i}`, "plumbing").id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("replaces the seeded platform face and stock faces, keeps distinctive choices", () => {
    const site = { siteKey: "org-1", niche: "plumbing" };
    const pairing = pickFontPairing("org-1", "plumbing");
    expect(resolveSiteFont("Space Grotesk", site)).toBe(`${pairing.display}|${pairing.body}`);
    expect(resolveSiteFont(null, site)).toBe(`${pairing.display}|${pairing.body}`);
    expect(resolveSiteFont("Inter|Inter", site)).toBe(`${pairing.display}|${pairing.body}`);
    expect(resolveSiteFont("Fraunces|Epilogue", site)).toBe("Fraunces|Epilogue");
    expect(resolveSiteFont("Fraunces|Inter", site)).toBe(`Fraunces|${pairing.body}`);
    expect(resolveSiteFont("Fraunces", site)).toBe(`Fraunces|${pairing.body}`);
  });

  it("resolves an existing draft's seeded font from its org and trade", () => {
    const font = siteFontFor("Space Grotesk", { id: "abc", industry: "Plumbing" });
    expect(siteHeadingFont(font)).not.toBe("Space Grotesk");
  });

  it("loads the pairing with display=swap and a regular body weight", () => {
    const href = siteFontsHref("Bricolage Grotesque|Figtree", [])!;
    expect(href).toContain("display=swap");
    expect(href).toContain("family=Figtree:ital,wght@0,400");
    expect(href.startsWith("https://fonts.googleapis.com/css2?")).toBe(true);
  });

  it("does not download stock faces named inside layouts", () => {
    const tree = { root: { kind: "stack", children: [{ kind: "heading", style: { font: "Space Grotesk" } }, { kind: "text", style: { font: "Lora" } }] } };
    expect(compositionFonts([tree])).toEqual(["Lora"]);
  });
});
