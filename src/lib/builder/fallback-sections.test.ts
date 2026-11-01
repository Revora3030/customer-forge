import { describe, expect, it } from "vitest";
import { readComposition, validateComposition, writeComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import {
  FALLBACK_FIXED_TEXT,
  FALLBACK_LABEL_PREFIX,
  FALLBACK_SECTION_SETTINGS,
  contactActions,
  fallbackFamily,
  fallbackFloorComposition,
  fallbackSectionComposition,
  isFallbackLayout,
  type FallbackComponent,
  type FallbackFacts,
  type FallbackSection,
} from "@/lib/builder/fallback-sections";
import { MODEL_COMPONENT_KIND } from "@/lib/site-models";

const facts: FallbackFacts = {
  businessName: "Harbor Lane Plumbing",
  services: ["Drain cleaning", "Water heater repair", "Leak detection"],
  description: "Family plumbing team for homes and small shops.",
  city: "Portland",
  region: "ME",
  serviceArea: "Greater Portland",
  phone: "(207) 555-0142",
  email: "hello@harborlane.example",
  yearsInBusiness: 12,
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ROLES = [
  "hero", "home", "services", "service_menu", "social_proof", "reviews", "testimonials", "faq", "process",
  "how_it_works", "service_area", "locations", "story", "about", "values", "why_us", "cta", "final_cta",
  "quote", "booking", "contact", "sticky_cta", "gallery", "recent_work", "page", "pricing", "team",
  "something_new_the_planner_invented",
];

function richSection(kind: string, n: number): FallbackSection {
  const components: FallbackComponent[] = [
    { id: uuid(n * 10 + 1), kind: "image", label: "Technician at a sink", media_url: "org/a.jpg" },
    { id: uuid(n * 10 + 2), kind: "image", label: "Van outside a house", media_url: "org/b.jpg" },
    { id: uuid(n * 10 + 3), kind: MODEL_COMPONENT_KIND, label: "Boiler model", media_url: "org/boiler.glb" },
    { id: uuid(n * 10 + 4), kind: "button", label: "Book a visit", link_url: "/contact" },
    { id: uuid(n * 10 + 5), kind: "faq_item", label: "Do you work weekends?", body: "Yes, on Saturdays." },
    { id: uuid(n * 10 + 6), kind: "list_item", label: "We look at the problem" },
    { id: uuid(n * 10 + 7), kind: "card", label: "Drain cleaning", body: "Clearing blocked drains." },
  ];
  return { id: uuid(n), kind, heading: "Saved heading", subheading: "Saved subheading", body: "Saved body text.", components };
}

const emptySection = (kind: string, n: number): FallbackSection => ({ id: uuid(n), kind, heading: null, subheading: null, body: null, components: [] });

function validate(section: FallbackSection, tree: CompositionTree) {
  const result = check(section, tree);
  return { ok: result.ok, issues: result.ok ? [] : result.issues };
}
function check(section: FallbackSection, tree: CompositionTree) {
  const media = (section.components ?? []).filter((c) => c.media_url);
  const refs = new Set(media.map((c) => c.id));
  const models = new Set(media.filter((c) => c.kind === MODEL_COMPONENT_KIND).map((c) => c.id));
  return validateComposition(tree, { firstBuild: true, allowedMediaRefs: refs, requiredMediaRefs: refs, modelRefs: models });
}

function strings(node: CompositionNode): string[] {
  return [
    node.type === "widget" ? undefined : node.text, node.alt,
    ...(node.items ?? []),
    ...(node.faqItems ?? []).flatMap((item) => [item.question, item.answer]),
    node.primaryCta?.label, node.primaryCta?.ariaLabel, node.secondaryCta?.label,
    ...(node.children ?? []).flatMap(strings),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

/** Every visible string is saved material, a business fact or a fixed label. */
function untraceable(section: FallbackSection, tree: CompositionTree): string[] {
  const sources = [
    section.heading, section.subheading, section.body,
    ...(section.components ?? []).flatMap((c) => [c.label, c.body, c.link_label]),
    facts.businessName, facts.description, facts.city, facts.region, facts.serviceArea, facts.phone, facts.email,
    String(facts.yearsInBusiness), ...(facts.services ?? []),
    "Turn it around", "Details", "Ask about this",
    ...FALLBACK_FIXED_TEXT,
  ].filter((value): value is string => Boolean(value)).sort((a, b) => b.length - a.length);
  return strings(tree.root).filter((text) => {
    let rest = text;
    for (const source of sources) rest = rest.split(source).join(" ");
    return !/^[\s,.:;…\-–—]*$/.test(rest);
  });
}

describe("facts-only fallback sections", () => {
  it.each(ROLES.map((role, i) => [role, i + 1] as const))("%s: a rich section validates, shows every picture and invents nothing", (role, n) => {
    const section = richSection(role, n);
    const tree = fallbackSectionComposition(section, { facts, enquiryHref: "/contact", seed: "harbor", lead: role === "hero" });
    const result = validate(section, tree);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(tree.label?.startsWith(FALLBACK_LABEL_PREFIX)).toBe(true);
    expect(tree.root.children?.length).toBeGreaterThan(0);
    expect(untraceable(section, tree)).toEqual([]);
  });

  it.each(ROLES.map((role, i) => [role, i + 100] as const))("%s: an empty section still gets a valid, non-empty layout", (role, n) => {
    const section = emptySection(role, n);
    const tree = fallbackSectionComposition(section, { facts, enquiryHref: "/contact", seed: "harbor" });
    const result = validate(section, tree);
    expect(result.issues).toEqual([]);
    expect(tree.root.children?.length).toBeGreaterThan(0);
    expect(strings(tree.root).length + (JSON.stringify(tree).includes('"widget"') ? 1 : 0)).toBeGreaterThan(0);
    expect(untraceable(section, tree)).toEqual([]);
  });

  it.each(ROLES.map((role, i) => [role, i + 200] as const))("%s: with no facts at all the layout is still valid and non-empty", (role, n) => {
    const section = emptySection(role, n);
    const tree = fallbackSectionComposition(section, { facts: {} });
    expect(validate(section, tree).ok).toBe(true);
    expect(tree.root.children?.length).toBeGreaterThan(0);
  });

  it("never types a price, rating or review", () => {
    for (const [i, role] of ROLES.entries()) {
      const json = JSON.stringify(fallbackSectionComposition(emptySection(role, 300 + i), { facts, enquiryHref: "/contact" }));
      expect(json).not.toMatch(/[$£€]\s?\d|\d\s?(stars?|★)|\/5\b|rated|award/i);
    }
  });

  it("proof sections show only the stored-review wall, never typed testimonials", () => {
    const tree = fallbackSectionComposition(emptySection("testimonials", 400), { facts });
    const json = JSON.stringify(tree);
    expect(json).toContain('"review_wall"');
    expect(json).toContain("12 years in business");
    expect(tree.root.children?.some((c) => c.type === "quote")).toBe(false);
  });

  it("service cards come from the owner's real service names", () => {
    const tree = fallbackSectionComposition(emptySection("services", 401), { facts, enquiryHref: "/contact" });
    const text = strings(tree.root);
    for (const service of facts.services ?? []) expect(text).toContain(service);
  });

  it("working sections keep their widget", () => {
    expect(JSON.stringify(fallbackSectionComposition(emptySection("quote", 402), { facts }))).toContain('"quote_calculator"');
    expect(JSON.stringify(fallbackSectionComposition(emptySection("booking", 403), { facts }))).toContain('"booking_form"');
    const contact = JSON.stringify(fallbackSectionComposition(emptySection("contact", 404), { facts }));
    expect(contact).toContain('"enquiry_form"');
    expect(contact).toContain('"contact_details"');
  });

  it("the sticky bar calls the business and has no child nodes", () => {
    const tree = fallbackSectionComposition(emptySection("sticky_cta", 405), { facts, enquiryHref: "/contact" });
    const bar = tree.root.children?.[0];
    expect(bar?.type).toBe("mobile_sticky_bar");
    expect(bar?.primaryCta?.href).toBe("tel:2075550142");
    expect(bar?.secondaryCta?.href).toBe("/contact");
  });

  it("contact actions use only real, safe contact facts", () => {
    expect(contactActions({ facts: { phone: "12", email: "not an email" } })).toEqual([]);
    const actions = contactActions({ facts, enquiryHref: "javascript:alert(1)" }, 3);
    expect(actions.map((a) => a.href)).toEqual(["tel:2075550142", "mailto:hello@harborlane.example"]);
  });

  it("the hero leads with the business name as the page's h1 when nothing was saved", () => {
    const tree = fallbackSectionComposition(emptySection("hero", 406), { facts, lead: true, enquiryHref: "/contact" });
    const first = tree.root.children?.[0];
    expect(first).toMatchObject({ type: "heading", level: 1, text: "Harbor Lane Plumbing" });
  });

  it("FAQ answers come from saved FAQ items", () => {
    const tree = fallbackSectionComposition(richSection("faq", 407), { facts });
    const accordion = tree.root.children?.find((c) => c.type === "faq_accordion");
    expect(accordion?.faqItems).toEqual([{ question: "Do you work weekends?", answer: "Yes, on Saturdays.", defaultOpen: true }]);
  });

  it("the floor layout validates for every role and keeps every picture", () => {
    for (const [i, role] of ROLES.entries()) {
      const section = richSection(role, 500 + i);
      const tree = fallbackFloorComposition(section, { facts, enquiryHref: "/contact" });
      expect(validate(section, tree).issues).toEqual([]);
    }
  });

  it("is deterministic", () => {
    const section = richSection("services", 600);
    expect(fallbackSectionComposition(section, { facts, seed: "x" })).toEqual(fallbackSectionComposition(section, { facts, seed: "x" }));
  });

  it("saved fallback layouts round-trip and are flagged for an AI upgrade", () => {
    const tree = fallbackSectionComposition(richSection("about", 601), { facts });
    const settings = { ...writeComposition({}, tree), ...FALLBACK_SECTION_SETTINGS };
    expect(readComposition(settings)?.label).toBe("fallback-about");
    expect(isFallbackLayout(settings)).toBe(true);
    expect(isFallbackLayout(writeComposition({}, { ...tree, label: "ai-about" }))).toBe(false);
  });

  it("maps unknown planner roles to a generic layout", () => {
    expect(fallbackFamily("something_new")).toBe("generic");
    expect(fallbackFamily("something_new", true)).toBe("hero");
    expect(fallbackFamily("customer_reviews")).toBe("proof");
  });
});
