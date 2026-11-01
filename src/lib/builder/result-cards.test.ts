import { describe, expect, it } from "vitest";
import { lunaCard, solBrief, terraBadge, type VisualReportRow } from "./result-cards";

const row = (measurements: unknown[], at = "2026-10-31T20:00:00Z", page = "home"): VisualReportRow => ({ measured_at: at, page_slug: page, measurements });
const byId = (rows: VisualReportRow[] | null) => Object.fromEntries(terraBadge(rows).checks.map((c) => [c.id, c]));

describe("terraBadge", () => {
  it("says NOT VERIFIED for everything when nothing was measured", () => {
    for (const rows of [null, [], [row([])]]) {
      const checks = terraBadge(rows).checks;
      expect(checks.map((c) => c.state)).toEqual(["not_verified", "not_verified", "not_verified"]);
      expect(checks.every((c) => c.detail.includes("NOT VERIFIED"))).toBe(true);
      expect(checks.every((c) => !/:1|smallest| element| control/.test(c.detail))).toBe(true);
    }
    expect(terraBadge(null).measuredAt).toBeNull();
  });

  it("only passes overflow when a 320 px reading exists; other widths do not count", () => {
    expect(byId([row([{ width: 390, scrollWidth: 390, overflowing: [] }])])["overflow_320"]?.state).toBe("not_verified");
    expect(byId([row([{ width: 320, scrollWidth: 320, overflowing: [] }])])["overflow_320"]?.state).toBe("pass");
    const failed = byId([row([{ width: 320, overflowing: [{ selector: ".a", right: 400 }, { selector: ".b", right: 380 }] }])])["overflow_320"];
    expect(failed?.state).toBe("fail");
    expect(failed?.detail).toContain("2 elements");
  });

  it("reports the measured contrast ratio and small target size, not invented ones", () => {
    const checks = byId([row([
      { width: 390, smallTargets: [{ selector: "a", width: 30, height: 40 }, { selector: "b", width: 44, height: 20 }], overflowing: [], accessibility: { lowContrast: [{ selector: "p", ratio: 3.21 }, { selector: "h2", ratio: 2.5 }] } },
    ])]);
    expect(checks["contrast"]?.state).toBe("fail");
    expect(checks["contrast"]?.detail).toContain("2.50:1");
    expect(checks["tap_targets"]?.state).toBe("fail");
    expect(checks["tap_targets"]?.detail).toContain("smallest 20px");
    expect(checks["overflow_320"]?.state).toBe("not_verified");
  });

  it("passes contrast and tap targets only from measured empty lists", () => {
    const checks = byId([row([{ width: 390, smallTargets: [], accessibility: { lowContrast: [] } }])]);
    expect(checks["contrast"]?.state).toBe("pass");
    expect(checks["tap_targets"]?.state).toBe("pass");
  });

  it("an accessibility object without a contrast list is not a contrast pass", () => {
    expect(byId([row([{ width: 390, accessibility: { h1Count: 1 } }])])["contrast"]?.state).toBe("not_verified");
  });

  it("the newest reading for a page wins over an older one", () => {
    const rows = [
      row([{ width: 320, overflowing: [{ selector: ".x", right: 500 }] }], "2026-10-30T10:00:00Z"),
      row([{ width: 320, overflowing: [] }], "2026-10-31T10:00:00Z"),
    ];
    expect(byId(rows)["overflow_320"]?.state).toBe("pass");
    expect(terraBadge(rows).measuredAt).toBe("2026-10-31T10:00:00Z");
  });
});

describe("lunaCard", () => {
  const head = {
    meta: [
      { title: "Elite Pressure Washing | Raleigh" },
      { name: "description", content: "Driveways, siding and roofs in Raleigh." },
    ],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "HomeAndConstructionBusiness", hasOfferCatalog: { "@type": "OfferCatalog", itemListElement: [{ "@type": "Offer" }] } }) },
      { type: "application/ld+json", children: JSON.stringify({ "@type": "FAQPage", mainEntity: [{ "@type": "Question" }] }) },
    ],
  };

  it("lists the JSON-LD types actually present with title and description lengths", () => {
    const card = lunaCard(head)!;
    expect(card.jsonLdTypes).toEqual(["HomeAndConstructionBusiness", "OfferCatalog", "Offer", "FAQPage", "Question"]);
    expect(card.jsonLdBlocks).toBe(2);
    expect(card.title).toEqual({ present: true, length: 32, text: "Elite Pressure Washing | Raleigh" });
    expect(card.description.length).toBe("Driveways, siding and roofs in Raleigh.".length);
    expect(card.noindex).toBe(false);
  });

  it("reports missing title, description and schema as missing, with no invented types", () => {
    const card = lunaCard({ meta: [], scripts: [] })!;
    expect(card.title).toEqual({ present: false, length: 0, text: "" });
    expect(card.description.present).toBe(false);
    expect(card.jsonLdTypes).toEqual([]);
    expect(card.jsonLdBlocks).toBe(0);
  });

  it("ignores unparseable or non-JSON-LD scripts and flags noindex", () => {
    const card = lunaCard({ meta: [{ name: "robots", content: "noindex" }], scripts: [{ type: "application/ld+json", children: "{oops" }, { type: "text/javascript", children: "{\"@type\":\"Thing\"}" }] })!;
    expect(card.jsonLdTypes).toEqual([]);
    expect(card.noindex).toBe(true);
  });

  it("returns null without a head", () => {
    expect(lunaCard(null)).toBeNull();
  });
});

describe("solBrief", () => {
  it("mirrors the real creative brief and is null without one", () => {
    expect(solBrief(null)).toBeNull();
    const brief = solBrief({ styleName: "Clean slate", mood: "calm", tone: "dark", font: "Inter", fontNote: "Neutral and legible", colors: { primary: "#fff", secondary: "#111", accent: "#0af" }, because: "Fits a trade brand", pages: [], brandLocked: false });
    expect(brief?.styleName).toBe("Clean slate");
    expect(brief?.fontNote).toBe("Neutral and legible");
    expect(brief).not.toHaveProperty("pages");
  });
});
