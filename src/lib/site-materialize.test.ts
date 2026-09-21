import { describe, expect, it } from "vitest";
import { materializeSiteContent, planSiteContent, type MaterializeInput } from "@/lib/site-materialize.server";
import { materializedSectionDesign } from "@/lib/site-materialize.server";
import { DESIGN_DIRECTIONS } from "@/lib/design-directions";
import { classifyArchetype } from "@/lib/site-archetypes";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import { playbookFor } from "@/lib/builder/industry";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.server";

const input: MaterializeInput = {
  businessName: "Journey Detailing",
  copy: {
    heroHeadline: "Mobile detailing in Tampa, done right",
    heroSubheadline: "We come to you.",
    primaryCta: "Get a price",
    secondaryCta: "See services",
    intro: "Journey Detailing cleans cars at your home or office.",
    about: "We started detailing in Tampa.",
    benefits: ["We come to you", "Fixed prices"],
    serviceCards: [{ name: "Full detail", copy: "Inside and out." }],
    faqs: [{ question: "How long does it take?", answer: "About two hours." }],
    areaCopy: "We work across Tampa.",
    metaTitle: "Mobile detailing in Tampa",
    metaDescription: "Book a mobile detail in Tampa.",
    ogTitle: "Mobile detailing in Tampa",
    ogDescription: "Book a mobile detail in Tampa.",
  },
  services: [{ name: "Full detail", description: null, price: 180, starting_price: null }],
  city: "Tampa",
  state: "FL",
  serviceArea: null,
  phone: "8135550123",
  email: "hi@journey.test",
  yearsInBusiness: 4,
  photoCount: 0,
  hasQuoteForm: true,
  hasBooking: true,
};

describe("planSiteContent", () => {
  it("builds a home page plus the core pages", () => {
    const pages = planSiteContent(input);
    const slugs = pages.map((page) => page.slug);
    expect(slugs[0]).toBe("home");
    expect(pages[0]!.kind).toBe("home");
    expect(slugs).toEqual(
      expect.arrayContaining(["home", "services", "pricing", "about", "book", "contact"]),
    );
  });

  it("fills the home page with real content", () => {
    const home = planSiteContent(input)[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds).toContain("hero");
    expect(kinds).toContain("services");
    expect(kinds).toContain("faq");
    expect(kinds).toContain("quote");
    const hero = home.sections.find((section) => section.kind === "hero")!;
    expect(hero.heading).toContain("Tampa");
    expect(hero.components?.[0]?.link_url).toBe("/#quote");
  });

  it("omits sections that have no supplied facts", () => {
    const bare = planSiteContent({
      ...input,
      services: [],
      copy: { ...input.copy, serviceCards: [], benefits: [], faqs: [] },
      yearsInBusiness: null,
      city: null,
      state: null,
      phone: null,
      hasQuoteForm: false,
      hasBooking: false,
    });
    const home = bare[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds).not.toContain("services");
    expect(kinds).not.toContain("benefits");
    expect(kinds).not.toContain("trust_bar");
    expect(bare.map((page) => page.slug)).not.toContain("pricing");
  });

  it("gives every first-build section a visible, industry-specific design contract", () => {
    const direction = DESIGN_DIRECTIONS.find((item) => item.id === "coastal-blue");
    expect(direction).toBeTruthy();
    const hero = materializedSectionDesign("hero", direction);
    const services = materializedSectionDesign("services", direction);
    expect(hero.variant).toMatch(/^hero-/);
    expect(hero.settings).toMatchObject({
      effect: direction?.heroEffect,
      visual: { layout: "layered", max_width: "wide", image_treatment: "rounded" },
    });
    expect(services.variant).toMatch(/^cards-/);
    expect(services.settings).toMatchObject({
      effect: direction?.bodyEffect,
      visual: { layout: "editorial", card_style: "soft" },
    });
  });

  it("turns the full fingerprint into materially different rendered contracts", () => {
    const direction = DESIGN_DIRECTIONS.find((item) => item.id === "coastal-blue");
    const a = createDesignFingerprint({ businessName: "Journey Detailing", industry: "automotive", city: "Tampa", photoCount: 4 });
    const b = createDesignFingerprint({ businessName: "Northstar Dental", industry: "dental", city: "Tampa", photoCount: 4 });
    const first = materializedSectionDesign("hero", direction, a, 0);
    const second = materializedSectionDesign("hero", direction, b, 0);
    expect(first.variant).not.toBe(second.variant);
    expect(first.settings).not.toEqual(second.settings);
  });

  it("orders the home story from the detected industry's conversion playbook", () => {
    const playbook = playbookFor("Emergency plumbing");
    const home = planSiteContent({ ...input, industryPlaybook: playbook })[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds[0]).toBe("hero");
    expect(kinds.at(-1)).toBe("sticky_cta");
    expect(kinds.indexOf("services")).toBeLessThan(kinds.indexOf("faq"));
  });
});

describe("planSiteContent with a website archetype", () => {
  it("shapes the site for the kind of business it is", () => {
    const restaurant = classifyArchetype({ industry: "Restaurant" });
    const pages = planSiteContent({ ...input, photoCount: 6, archetype: restaurant });
    expect(pages.map((page) => page.slug)).toEqual(expect.arrayContaining(["menu", "visit"]));
    const home = pages[0]!;
    expect(home.sections.map((s) => s.kind)).toContain("gallery");
    // the closing CTA stays last (before the sticky bar)
    const kinds = home.sections.map((s) => s.kind);
    expect(kinds.indexOf("cta")).toBeGreaterThan(kinds.indexOf("gallery"));
  });

  it("gives different industries different structures", () => {
    const shapes = ["Restaurant", "Dental", "Gym", "Hotel", "Law"].map((industry) =>
      planSiteContent({
        ...input,
        photoCount: 4,
        archetype: classifyArchetype({ industry }),
      })
        .map((page) => page.slug)
        .join(","),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("leaves out archetype sections with no supplied facts", () => {
    const pages = planSiteContent({
      ...input,
      photoCount: 0,
      services: [],
      archetype: classifyArchetype({ industry: "Restaurant" }),
    });
    const kinds = pages.flatMap((page) => page.sections.map((s) => s.kind));
    expect(kinds).not.toContain("gallery");
    expect(kinds).not.toContain("reviews");
  });
});

function generatedAsset(overrides: Partial<FirstBuildImageAsset>): FirstBuildImageAsset {
  return {
    slot: "hero",
    label: "Generated hero",
    altText: "Generated starter image for Journey Detailing",
    path: "org-1/generated-hero.png",
    mediaId: "media-1",
    provider: "cloudflare",
    model: "@cf/black-forest-labs/flux-1-schnell",
    prompt: "premium website photography",
    placement: ["hero"],
    aspectRatio: "16:9",
    ...overrides,
  };
}

function materializeDb(existingPages = 0) {
  let id = 0;
  const inserts: Record<string, unknown[]> = {
    website_pages: [],
    website_sections: [],
    website_components: [],
  };
  const nextId = (table: string) => `${table}-${++id}`;
  return {
    inserts,
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ count: existingPages }),
      }),
      insert: (row: unknown) => {
        inserts[table] = inserts[table] ?? [];
        if (Array.isArray(row)) inserts[table].push(...row);
        else inserts[table].push(row);
        return {
          error: null,
          select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }),
        };
      },
    }),
  };
}

describe("materializeSiteContent generated-image attachment path", () => {
  it("counts only generated images that actually reach inserted components", async () => {
    const assets = [
      generatedAsset({ slot: "hero", label: "Hero", path: "org-1/hero.png" }),
      generatedAsset({ slot: "service", label: "Full detail", path: "org-1/service.png" }),
      generatedAsset({ slot: "cta", label: "CTA", path: "org-1/cta.png" }),
      generatedAsset({ slot: "social", label: "Share", path: "org-1/social.png" }),
    ];
    const db = materializeDb();
    const result = await materializeSiteContent(db as never, "org-1", {
      ...input,
      generatedAssets: assets,
    });
    const componentMedia = (db.inserts["website_components"] ?? [])
      .map((row) => (row as { media_url?: string | null }).media_url)
      .filter(Boolean);
    expect(componentMedia).toEqual(
      expect.arrayContaining(["org-1/hero.png", "org-1/service.png", "org-1/cta.png"]),
    );
    expect(componentMedia).not.toContain("org-1/social.png");
    expect(result.generatedImageAttachments).toBe(
      componentMedia.filter((value) => assets.some((asset) => asset.path === value)).length,
    );
    expect(result.generatedImageAttachments).toBeGreaterThanOrEqual(3);
  });

  it("does not attach generated proof/gallery/team/result images even if a bad caller passes them in", () => {
    const pages = planSiteContent({
      ...input,
      photoCount: 0,
      generatedAssets: [
        generatedAsset({ slot: "about", label: "Team", path: "org-1/team.png", placement: ["team"] }),
        generatedAsset({ slot: "proof", label: "Proof", path: "org-1/proof.png", placement: ["proof"] }),
        generatedAsset({ slot: "background", label: "Gallery", path: "org-1/gallery.png", placement: ["gallery"] }),
      ],
    });
    const media = pages.flatMap((page) =>
      page.sections.flatMap((section) => section.components?.map((component) => component.media_url) ?? []),
    );
    expect(media).not.toContain("org-1/gallery.png");
    expect(media).not.toContain("org-1/team.png");
    expect(media).not.toContain("org-1/proof.png");
  });
});
