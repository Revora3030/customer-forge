import { describe, expect, it } from "vitest";
import { buildStoryPlan, pendingStoryLinks, type StoryPage } from "@/lib/builder/story-pass";

const page = (over: Partial<StoryPage> & { slug: string }): StoryPage => ({
  id: over.slug,
  title: over.title ?? over.slug,
  kind: over.kind ?? "page",
  isVisible: over.isVisible ?? true,
  sectionKinds: over.sectionKinds ?? [],
  slug: over.slug,
});

const fiveSite = () => [
  page({ slug: "home", title: "Home", sectionKinds: ["hero", "services"] }),
  page({ slug: "contact", title: "Contact", sectionKinds: ["contact"] }),
  page({ slug: "pricing", title: "Pricing", sectionKinds: ["pricing"] }),
  page({ slug: "services", title: "Services", sectionKinds: ["services"] }),
  page({ slug: "testimonials", title: "Testimonials", sectionKinds: ["testimonials"] }),
];

describe("multi-page storytelling", () => {
  it("orders pages into the visitor journey, not storage order", () => {
    const plan = buildStoryPlan(fiveSite());
    expect(plan.order.map((step) => step.slug)).toEqual([
      "home",
      "services",
      "testimonials",
      "pricing",
      "contact",
    ]);
  });

  it("writes a next-step link on every page but the last", () => {
    const plan = buildStoryPlan(fiveSite());
    expect(plan.links.find((link) => link.fromSlug === "home")?.toSlug).toBe("services");
    expect(plan.links.find((link) => link.fromSlug === "pricing")?.toSlug).toBe("contact");
    expect(plan.links.every((link) => link.href.startsWith("/"))).toBe(true);
  });

  it("uses the home path for the home page", () => {
    const plan = buildStoryPlan([
      page({ slug: "about", title: "About" }),
      page({ slug: "home", title: "Home" }),
    ]);
    expect(plan.links[0]?.href).toBe("/about");
  });

  it("ignores hidden pages", () => {
    const plan = buildStoryPlan([
      ...fiveSite(),
      page({ slug: "secret", title: "Secret", isVisible: false }),
    ]);
    expect(plan.order.some((step) => step.slug === "secret")).toBe(false);
    expect(plan.links.some((link) => link.toSlug === "secret")).toBe(false);
  });

  it("reports a missing ending when nobody can get in touch", () => {
    const plan = buildStoryPlan([
      page({ slug: "home", title: "Home" }),
      page({ slug: "services", title: "Services", sectionKinds: ["services"] }),
    ]);
    expect(plan.findings.some((finding) => finding.kind === "missing_step")).toBe(true);
  });

  it("reports two pages doing the same job", () => {
    const plan = buildStoryPlan([
      page({ slug: "home", title: "Home" }),
      page({ slug: "prices", title: "Prices", sectionKinds: ["pricing"] }),
      page({ slug: "pricing", title: "Pricing", sectionKinds: ["pricing"] }),
      page({ slug: "contact", title: "Contact", sectionKinds: ["contact"] }),
    ]);
    expect(plan.findings.some((finding) => finding.kind === "duplicate_role")).toBe(true);
  });

  it("says so honestly when there are no pages", () => {
    const plan = buildStoryPlan([]);
    expect(plan.order).toEqual([]);
    expect(plan.summary).toContain("no visitor-facing pages");
  });

  it("does not repeat a link that already exists", () => {
    const plan = buildStoryPlan(fiveSite());
    const existing = plan.links.map((link) => ({ pageSlug: link.fromSlug, href: link.href }));
    expect(pendingStoryLinks(plan, existing)).toEqual([]);
    expect(pendingStoryLinks(plan, []).length).toBe(plan.links.length);
  });

  it("labels links without inventing anything about the business", () => {
    const plan = buildStoryPlan(fiveSite());
    for (const link of plan.links) {
      expect(link.label.length).toBeLessThanOrEqual(40);
      expect(/[$£€%]|\d{3,}/.test(link.label)).toBe(false);
    }
  });
});
