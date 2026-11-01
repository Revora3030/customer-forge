import { describe, expect, it } from "vitest";
import { legacySectionToComposition, type LegacySection } from "./legacy-composition";
import { VARIANT_COUNTS, pickVariant, type SectionVariantGroup } from "./section-variants";
import { validateComposition, type CompositionNode } from "./composition-tree";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function walk(node: CompositionNode, out: CompositionNode[] = []): CompositionNode[] {
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

describe("legacySectionToComposition", () => {
  it("turns an old hero into a valid composition tree using only its own content", () => {
    const tree = legacySectionToComposition(
      {
        id: id(1),
        kind: "hero",
        heading: "Elite Pressure Washing",
        subheading: "Driveways, siding and roofs in Raleigh",
        body: null,
        components: [
          { id: id(2), kind: "hero_image", url: "https://example.com/a.jpg", label: "Clean driveway" },
          { id: id(3), kind: "button", link_url: "/contact", link_label: "Get a quote" },
        ],
      },
      { lead: true },
    );
    expect(tree).not.toBeNull();
    const result = validateComposition(tree, { allowedMediaRefs: new Set([id(2)]) });
    expect(result.ok).toBe(true);
    const nodes = walk(tree!.root);
    expect(nodes.filter((n) => n.type === "heading" && n.level === 1).map((n) => n.text)).toEqual(["Elite Pressure Washing"]);
    expect(nodes.some((n) => n.type === "media" && n.mediaRef === id(2))).toBe(true);
    expect(nodes.some((n) => n.type === "button" && n.href === "/contact" && n.text === "Get a quote")).toBe(true);
    // No colour is chosen by the adapter: the site theme decides.
    expect(nodes.some((n) => n.style?.color || n.style?.background)).toBe(false);
  });

  it("lays services out as a responsive card grid", () => {
    const tree = legacySectionToComposition({
      id: id(4),
      kind: "services",
      heading: "Services",
      components: [
        { id: id(5), kind: "card", label: "Driveway Cleaning", body: "Oil and rust stains lifted." },
        { id: id(6), kind: "card", label: "House Soft Washing", body: "Low-pressure siding wash." },
        { id: id(7), kind: "card", label: "Roof Cleaning", body: "Black streak removal." },
      ],
    });
    expect(validateComposition(tree).ok).toBe(true);
    const grid = walk(tree!.root).find((n) => n.type === "grid");
    expect(grid?.style?.columns).toBe(3);
    expect(grid?.responsive?.mobile?.columns).toBe(1);
    expect(grid?.children?.length).toBe(3);
  });

  it("renders nothing for an empty section and ignores non-legacy kinds", () => {
    expect(legacySectionToComposition({ id: id(8), kind: "hero", heading: "", components: [] })).toBeNull();
    expect(legacySectionToComposition({ id: id(9), kind: "contact", heading: "Contact" })).toBeNull();
  });

  it("drops unsafe links instead of rendering them", () => {
    const tree = legacySectionToComposition({
      id: id(1),
      kind: "page",
      heading: "About",
      components: [{ id: id(2), kind: "button", link_url: "javascript:alert(1)", link_label: "Click" }],
    });
    expect(walk(tree!.root).some((n) => n.type === "button")).toBe(false);
  });
});

// ---- Layout variants ------------------------------------------------------

/** Finds a seed that makes the given group pick the given variant for this section. */
function seedFor(group: SectionVariantGroup, sectionId: string, variant: number): string {
  for (let i = 0; i < 5000; i++) {
    const seed = `site-${i}`;
    if (pickVariant(group, sectionId, seed) === variant) return seed;
  }
  throw new Error(`no seed found for ${group} variant ${variant}`);
}

const texts = (root: CompositionNode) =>
  walk(root).flatMap((n) => (typeof n.text === "string" ? [n.text] : [])).sort();
const hrefs = (root: CompositionNode) =>
  walk(root).flatMap((n) => (typeof n.href === "string" ? [n.href] : [])).sort();
const refs = (root: CompositionNode) =>
  walk(root).flatMap((n) => (typeof n.mediaRef === "string" ? [n.mediaRef] : [])).sort();

const hero: LegacySection = {
  id: id(1),
  kind: "hero",
  heading: "Elite Pressure Washing",
  subheading: "Driveways, siding and roofs in Raleigh",
  body: "Family run since the day we opened.",
  components: [
    { id: id(2), kind: "hero_image", url: "https://example.com/a.jpg", label: "Clean driveway" },
    { id: id(3), kind: "button", link_url: "/contact", link_label: "Get a quote" },
  ],
};
const about: LegacySection = {
  id: id(4),
  kind: "about",
  heading: "About us",
  body: "We wash things.",
  components: [{ id: id(5), kind: "image", url: "https://example.com/b.jpg", label: "Our crew" }],
};
const services: LegacySection = {
  id: id(6),
  kind: "services",
  heading: "Services",
  components: [
    { id: id(7), kind: "card", label: "Driveway Cleaning", body: "Oil and rust stains lifted.", link_url: "/driveways", link_label: "Learn more" },
    { id: id(8), kind: "card", label: "House Soft Washing", body: "Low-pressure siding wash." },
    { id: id(9), kind: "card", label: "Roof Cleaning", body: "Black streak removal." },
  ],
};
const proof: LegacySection = {
  id: id(10),
  kind: "social_proof",
  heading: "What customers say",
  components: [
    { id: id(11), kind: "card", label: "Dana R.", body: "Great job on the driveway." },
    { id: id(12), kind: "card", label: "Lee T.", body: "On time and tidy." },
    { id: id(13), kind: "card", label: "Sam K.", body: "Would book again." },
  ],
};
const cta: LegacySection = {
  id: id(14),
  kind: "cta",
  heading: "Ready for a clean driveway?",
  body: "Tell us about the job.",
  components: [{ id: id(15), kind: "button", link_url: "/contact", link_label: "Get a quote" }],
};

const cases: Array<[string, LegacySection, SectionVariantGroup, { lead?: boolean }]> = [
  ["hero", hero, "hero", { lead: true }],
  ["about", about, "about", {}],
  ["services", services, "cards", {}],
  ["testimonials", proof, "proof", {}],
  ["cta", cta, "cta", {}],
];

describe("section layout variants", () => {
  it.each(cases)("%s: no seed gives the same tree as variant 0", (_name, section, group, opts) => {
    const none = legacySectionToComposition(section, opts);
    const zero = legacySectionToComposition(section, { ...opts, seed: seedFor(group, section.id, 0) });
    expect(none).not.toBeNull();
    expect(zero).toEqual(none);
    expect(legacySectionToComposition(section, { ...opts, seed: "" })).toEqual(none);
  });

  it.each(cases)("%s: every variant is valid, distinct and shows only the section's own content", (_name, section, group, opts) => {
    const base = legacySectionToComposition(section, opts)!;
    const allowed = new Set((section.components ?? []).map((c) => c.id));
    const shapes = new Set<string>();
    for (let variant = 0; variant < VARIANT_COUNTS[group]; variant++) {
      const tree = legacySectionToComposition(section, { ...opts, seed: seedFor(group, section.id, variant) })!;
      expect(validateComposition(tree, { allowedMediaRefs: allowed }).ok).toBe(true);
      // Same real words, links and pictures in every layout; nothing invented, nothing dropped.
      expect(texts(tree.root)).toEqual(texts(base.root));
      expect(hrefs(tree.root)).toEqual(hrefs(base.root));
      expect(refs(tree.root)).toEqual(refs(base.root));
      // The site theme decides colour, never the adapter.
      expect(walk(tree.root).some((n) => n.style?.color || n.style?.background)).toBe(false);
      shapes.add(JSON.stringify(tree.root));
    }
    expect(shapes.size).toBe(VARIANT_COUNTS[group]);
  });

  it("is deterministic: the same seed always draws the same tree", () => {
    const a = legacySectionToComposition(services, { seed: "acme" });
    const b = legacySectionToComposition(services, { seed: "acme" });
    expect(a).toEqual(b);
  });

  it("keeps exactly one h1 when the lead section uses any hero variant", () => {
    for (let variant = 0; variant < VARIANT_COUNTS.hero; variant++) {
      const tree = legacySectionToComposition(hero, { lead: true, seed: seedFor("hero", hero.id, variant) })!;
      expect(walk(tree.root).filter((n) => n.type === "heading" && n.level === 1)).toHaveLength(1);
    }
  });

  it("never invents testimonials: reviews appear only from the section's own cards", () => {
    const empty = legacySectionToComposition({ id: id(16), kind: "social_proof", heading: "", components: [] }, { seed: "acme" });
    expect(empty).toBeNull();
    const tree = legacySectionToComposition({ ...proof, heading: null }, { seed: "acme" })!;
    expect(texts(tree.root)).toEqual(["Dana R.", "Great job on the driveway.", "Lee T.", "On time and tidy.", "Sam K.", "Would book again."].sort());
  });

  it("draws a call-to-action only from its own words or links, and is skipped when empty", () => {
    expect(legacySectionToComposition({ id: id(17), kind: "cta", heading: "", components: [] })).toBeNull();
    const buttonOnly = legacySectionToComposition({ id: id(18), kind: "cta", components: [{ id: id(19), kind: "button", link_url: "/contact", link_label: "Call us" }] });
    expect(buttonOnly).not.toBeNull();
    expect(texts(buttonOnly!.root)).toEqual(["Call us"]);
  });

  it("keeps ignoring section kinds the adapter does not draw", () => {
    expect(legacySectionToComposition({ id: id(20), kind: "contact", heading: "Contact" }, { seed: "acme" })).toBeNull();
    expect(legacySectionToComposition({ id: id(21), kind: "faq", heading: "FAQ" }, { seed: "acme" })).toBeNull();
  });
});
