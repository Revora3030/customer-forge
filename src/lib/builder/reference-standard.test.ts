import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { TRADE_PLAYBOOKS, ARCHETYPES, blueprintFor, playbookFor, playbookNote } from "@/lib/builder/industry-playbook";
import { TRADE_BLUEPRINTS, blueprintForKey } from "@/lib/builder/trade-blueprints";
import { paletteProblems } from "@/lib/builder/palette-guard";
import { REFERENCE_MOMENT_KEYS, referenceMomentsFor, referenceStandardNote } from "@/lib/builder/reference-standard";
import { COMPOSITION_PRIMITIVES, INTERACTIVE_PRIMITIVES, PRIMITIVE_GUIDE, validateComposition, type CompositionTree } from "@/lib/builder/composition-tree";
import { dialAngle, dialArcPath, dialOptionForKey } from "@/lib/builder/cinematic-primitives";
import { formatElapsed, toolRadius, brushRadius } from "@/lib/builder/reveal-brush";
import { scrubReadout } from "@/lib/builder/scrub";

const dial = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  root: {
    type: "dial_selector",
    text: "Pick a surface",
    dialUnit: "PSI",
    dialOptions: [
      { label: "Siding", value: "100-500", note: "Soft wash lifts algae without forcing water behind boards.", level: 15 },
      { label: "Concrete", value: "3,000-4,000", note: "Surface cleaner for even lanes.", level: 90 },
      { label: "Roof", value: "Soft wash", level: 5 },
    ],
    ...extra,
  },
});
const draw = (tree: CompositionTree) =>
  renderToStaticMarkup(createElement(CompositionRenderer, { tree, scope: "t", as: "div", resolveMedia: ((ref: string) => ({ url: `https://cdn.example/${ref}.jpg`, visual: { source: "owner" } })) as never }));

describe("reference standard reaches every business category", () => {
  it("has its own try-it and dial moments for every playbook and archetype", () => {
    for (const entry of [...TRADE_PLAYBOOKS, ...ARCHETYPES]) {
      expect(REFERENCE_MOMENT_KEYS).toContain(entry.key);
      expect(referenceMomentsFor(entry.key).tryIt.length).toBeGreaterThan(20);
    }
    expect(referenceMomentsFor("unknown-trade")).toEqual(referenceMomentsFor("general"));
  });
  it("is part of the look note for any business", () => {
    for (const industry of ["Pressure washing", "Hair salon", "Bakery", "Software consultancy", "Dentist", "Mystery business"]) {
      const note = playbookNote(industry) ?? "";
      expect(note).toContain("REFERENCE STANDARD");
      expect(note).toContain("TRY IT for this business");
      expect(note).toContain("DIAL for this business");
    }
    expect(referenceStandardNote("exterior-cleaning")).toContain("Clean this driveway.");
    // A business with no category still gets the general reading in the first build.
    expect(referenceStandardNote(null)).toContain(referenceMomentsFor("general").tryIt);
  });
  it("covers all 14 core trades and the three category playbooks with their own playbook, moments, blueprint and look", () => {
    const trades: [string, string][] = [
      ["Plumbing", "plumbing"],
      ["HVAC repair", "hvac"],
      ["Roofing contractor", "roofing"],
      ["Mobile auto detailing", "auto-detailing"],
      ["Pressure washing", "pressure-washing"],
      ["Landscaping", "landscaping"],
      ["House cleaning", "cleaning"],
      ["Italian restaurant", "restaurants"],
      ["Barber shop", "salons-barbers"],
      ["Med spa", "med-spa"],
      ["Family dentist", "dentist"],
      ["Personal injury law firm", "law-firms"],
      ["Real estate agent", "real-estate"],
      ["CrossFit gym", "gyms-fitness"],
      // Added with the category playbooks: these three no longer fall to a generic playbook.
      ["Jet ski rental", "watersports-rentals"],
      ["Golf course", "golf-course"],
      ["Luxury home builder", "home-builder"],
    ];
    expect(TRADE_BLUEPRINTS.map((b) => b.key).sort()).toEqual(trades.map(([, k]) => k).sort());
    for (const [industry, key] of trades) {
      expect(playbookFor(industry)?.key, industry).toBe(key);
      expect(REFERENCE_MOMENT_KEYS, industry).toContain(key);
      const moments = referenceMomentsFor(key);
      expect(moments.tryIt.length, industry).toBeGreaterThan(20);
      expect(moments.dial.length, industry).toBeGreaterThan(20);
      expect(blueprintFor(industry)?.key, industry).toBe(key);
      const note = playbookNote(industry)!;
      expect(note, industry).toContain("REFERENCE STANDARD");
      expect(note, industry).toContain(`TRY IT for this business: ${moments.tryIt}`);
      expect(note, industry).toContain(blueprintFor(industry)!.palette.canvas);
      expect(note, industry).toContain(blueprintFor(industry)!.fonts.display);
      expect(note, industry).toMatch(/never typed/);
    }
    expect(referenceStandardNote("pressure-washing")).toContain("Clean this driveway.");
  });
  it("gives every blueprint a palette the brand guard accepts, legible ink and no proof claims", () => {
    for (const b of TRADE_BLUEPRINTS) {
      expect(paletteProblems({ primary: b.palette.accent, secondary: b.palette.canvas, accent: b.palette.grounding }), b.key).toEqual([]);
      expect(b.cta.primary.length, b.key).toBeGreaterThan(5);
      expect([b.hero, b.signatureWidget, b.look, b.cta.primary, b.cta.secondary].join(" ").replace(/never guaranteed outcomes/g, ""), b.key).not.toMatch(/guarantee[ds]? (?:result|outcome)|award|#1\b|best in|\d+ ?stars?|5-star/i);
    }
    // Law firms never promise an outcome.
    expect(blueprintForKey("law-firms")!.look).toMatch(/never guaranteed outcomes/);
  });
  it("falls every other category back to its closest blueprint, and only a business with no signal to the obsidian look", () => {
    expect(blueprintFor("Mobile locksmith")?.key).toBe("plumbing");
    expect(blueprintFor("Chiropractor")?.key).toBe("dentist");
    expect(blueprintFor("Boutique hotel")?.key).toBe("restaurants");
    expect(blueprintFor("SaaS platform")?.key).toBe("hvac");
    expect(blueprintFor("Interstellar cheese")).toBeNull();
    for (const p of TRADE_PLAYBOOKS) expect(blueprintForKey(p.key), p.key).not.toBeNull();
    for (const a of ARCHETYPES.filter((x) => x.key !== "general")) expect(blueprintForKey(a.key), a.key).not.toBeNull();
    expect(playbookNote("Interstellar cheese")).toContain("Obsidian canvas");
  });
  it("keeps truth rules in the standard", () => {
    const note = referenceStandardNote("general");
    expect(note).toMatch(/never typed/);
    expect(note).toMatch(/only the owner's own real before and after photos/);
  });
});

describe("dial_selector", () => {
  it("is a registered interactive primitive with guide text", () => {
    expect(COMPOSITION_PRIMITIVES).toContain("dial_selector");
    expect(INTERACTIVE_PRIMITIVES.has("dial_selector")).toBe(true);
    expect(PRIMITIVE_GUIDE).toContain("dial_selector");
  });
  it("validates option count, level range, lengths and refuses prices", () => {
    expect(validateComposition(dial()).ok).toBe(true);
    expect(validateComposition(dial({ dialOptions: [{ label: "One", value: "Low", level: 10 }] })).ok).toBe(false);
    expect(validateComposition(dial({ dialOptions: [{ label: "A", value: "Low", level: 120 }, { label: "B", value: "High", level: 50 }] })).ok).toBe(false);
    expect(validateComposition(dial({ dialOptions: [{ label: "A", value: "$199", level: 10 }, { label: "B", value: "High", level: 50 }] })).ok).toBe(false);
    expect(validateComposition(dial({ dialUnit: "USD$" })).ok).toBe(false);
    expect(validateComposition({ version: 1, root: { type: "text", text: "x", dialUnit: "PSI" } }).ok).toBe(false);
  });
  it("server-renders the first reading and lists every option without JavaScript", () => {
    const result = validateComposition(dial());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const html = draw(result.tree);
    expect(html).toContain("rv-dial");
    expect(html).toContain("100-500");
    expect(html).toContain("PSI");
    expect(html).toContain("<table");
    expect(html).toContain("Concrete");
    expect(html).toContain("Soft wash");
  });
  it("maps levels onto a 240° sweep and moves with arrow keys", () => {
    expect(dialAngle(0)).toBe(-120);
    expect(dialAngle(50)).toBe(0);
    expect(dialAngle(100)).toBe(120);
    expect(dialArcPath(60, 60, 46, 0)).toBe("");
    expect(dialArcPath(60, 60, 46, 100)).toMatch(/^M .* A 46 46 0 1 1 /);
    expect(dialOptionForKey("ArrowRight", 2, 3)).toBe(0);
    expect(dialOptionForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(dialOptionForKey("End", 0, 3)).toBe(2);
    expect(dialOptionForKey("a", 0, 3)).toBeNull();
  });
});

describe("brush reveal tools and stopwatch", () => {
  const brush = (items: unknown, revealMode = "brush") => ({
    version: 1,
    root: {
      type: "before_after_slider", revealMode, text: "Clean this driveway", items,
      beforeImage: { mediaRef: "temp_before", alt: "Streaked driveway", label: "Before" },
      afterImage: { mediaRef: "temp_after", alt: "Clean driveway", label: "After" },
    },
  });
  it("accepts 1-3 tool chips only on a brush reveal", () => {
    expect(validateComposition(brush(["Surface cleaner", "25° tip", "40° tip"])).ok).toBe(true);
    expect(validateComposition(brush(["a", "b", "c", "d"])).ok).toBe(false);
    expect(validateComposition(brush(["Surface cleaner"], "slider")).ok).toBe(false);
  });
  it("renders the tool chips", () => {
    const result = validateComposition(brush(["Surface cleaner", "25° tip"]));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const html = draw(result.tree);
    expect(html).toContain("rv-cn-brush-tools");
    expect(html).toContain("Surface cleaner");
    expect(html).toContain("25° tip");
  });
  it("narrows later tools and formats the timer", () => {
    expect(toolRadius(800, 0, 3)).toBe(brushRadius(800));
    expect(toolRadius(800, 2, 3)).toBeLessThan(toolRadius(800, 1, 3));
    expect(toolRadius(800, 1, 3)).toBeLessThan(brushRadius(800));
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(67_400)).toBe("1:07");
  });
});

describe("scrub sequence progress readout", () => {
  it("reads percent and the labelled chapter", () => {
    const labels = ["Driveway", "Roof soft wash", "House wash"];
    expect(scrubReadout(0, labels)).toEqual({ percent: 0, step: 1, total: 3, label: "Driveway" });
    expect(scrubReadout(0.49, labels)).toMatchObject({ percent: 49, step: 2, label: "Roof soft wash" });
    expect(scrubReadout(1, labels)).toMatchObject({ percent: 100, step: 3, label: "House wash" });
  });
  it("accepts short frame labels and refuses long ones", () => {
    const seq = (text: string) => ({ version: 1, root: { type: "scrub_sequence", children: [
      { type: "media", mediaRef: "temp_a", alt: "Driveway", text },
      { type: "media", mediaRef: "temp_b", alt: "Roof", text: "Roof" },
      { type: "heading", level: 1, text: "Clean, not damaged." },
    ] } });
    expect(validateComposition(seq("Driveway")).ok).toBe(true);
    expect(validateComposition(seq("A very long chapter label over thirty chars")).ok).toBe(false);
  });
});
