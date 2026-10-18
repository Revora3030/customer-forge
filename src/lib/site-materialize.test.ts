import { describe, expect, it } from "vitest";
import type { MaterializeInput } from "@/lib/site-materialize.server";
import { materializedSectionDesign } from "@/lib/site-materialize.server";
import { parseAuthoredDirection } from "@/lib/authored-direction";
const AUTHORED_LOOK = {
  name: "Test authored look",
  mood: "Written by the model under test.",
  bestFor: "Tests",
  primary: "#1f6feb",
  secondary: "#0b1020",
  accent: "#f5c451",
  font: "Fraunces",
  fontNote: "test",
  backdrop: "none",
  backdropSpec: null,
  sectionEffects: { hero: "none" },
  defaultEffect: "rise",
};

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

describe("AI-only materialization", () => {
  it("applies no house layout of its own when there is no authored identity", () => {
    const direction = parseAuthoredDirection(AUTHORED_LOOK);
    expect(direction).toBeTruthy();
    const hero = materializedSectionDesign("hero", direction);
    const services = materializedSectionDesign("services", direction);
    expect(hero.variant).toBe("default");
    expect(services.variant).toBe("default");
    expect(hero.settings).toMatchObject({ effect: direction?.sectionEffects["hero"] });
    expect(services.settings).toMatchObject({ effect: direction?.defaultEffect });
    expect((hero.settings as { visual?: unknown }).visual).toBeUndefined();
    expect((services.settings as { visual?: unknown }).visual).toBeUndefined();
  });
});

describe("applyAuthoredHeadings", () => {
  it("uses only AI-written section headings", async () => {
    const { applyAuthoredHeadings } = await import("@/lib/site-materialize.server");
    const pages = [{ slug: "home", title: "Home", kind: "home", sections: [
      { kind: "hero", heading: "AI hero" },
      { kind: "services", heading: "What we do" },
      { kind: "faq", heading: "Common questions" },
    ] }] as never;
    const out = applyAuthoredHeadings(pages, [{ slug: "home", title: "Home", purpose: "home", primaryAction: "Call", sections: [
      { role: "hero" }, { role: "services", heading: "Roofs we fix", subheading: null }, { role: "faq" },
    ] }]) as unknown as { sections: { heading: string | null }[] }[];
    expect(out[0]!.sections.map((s) => s.heading)).toEqual(["AI hero", "Roofs we fix", null]);
  });
});

type Row = Record<string, unknown>;
type FirstBuildImageAsset = import("@/lib/builder/first-build-images.types").FirstBuildImageAsset;
type PageArchitecture = import("@/lib/builder/creative-authority").PageArchitecture;

/** In-memory stand-in for the three website tables the materializer writes. */
function fakeDb() {
  const tables: { website_pages: Row[]; website_sections: Row[]; website_components: Row[] } = {
    website_pages: [],
    website_sections: [],
    website_components: [],
  };
  let id = 0;
  const db = {
    from(table: keyof typeof tables) {
      return {
        select: () => ({ eq: async () => ({ count: 0, error: null }) }),
        insert(value: Row | Row[]) {
          const rows = (Array.isArray(value) ? value : [value]).map((row) => ({ id: `${table}-${++id}`, ...row }));
          tables[table]!.push(...rows);
          const result = { data: rows[0], error: null };
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          };
        },
      };
    },
  };
  return { db: db as never, tables };
}

const asset = (overrides: Partial<FirstBuildImageAsset>): FirstBuildImageAsset => ({
  slot: "slot",
  label: "Picture",
  altText: "A picture",
  path: "org/picture.jpg",
  mediaId: null,
  provider: "openai",
  model: "image-model",
  prompt: "",
  placement: [],
  aspectRatio: "3:2",
  ...overrides,
});

const plan = (pages: PageArchitecture[]) => async () => pages;

async function build(extra: Partial<MaterializeInput>) {
  const { materializeSiteContent } = await import("@/lib/site-materialize.server");
  const { db, tables } = fakeDb();
  const result = await materializeSiteContent(db, "org-1", { ...input, ...extra });
  const componentsOf = (role: string) => {
    const section = tables.website_sections!.find((row) => row["kind"] === role);
    return tables.website_components!.filter((row) => row["section_id"] === section?.["id"]);
  };
  return { result, tables, componentsOf };
}

describe("first-build media truth and page material", () => {
  it("keeps an owner photo as the owner's own, with no AI credit", async () => {
    const owner = asset({ provider: "owner", model: "owner", path: "org/IMG_2341.jpg", category: "work", placement: ["about"] });
    const { componentsOf } = await build({
      generatedAssets: [owner],
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "about", heading: "About", body: "We detail cars." }, { role: "contact" }] },
      ]),
    });
    const image = componentsOf("about").find((row) => row["media_url"] === "org/IMG_2341.jpg");
    const visual = (image?.["settings"] as { visual?: Record<string, unknown> }).visual ?? {};
    expect(visual["source"]).toBe("customer");
    expect(visual["credit"]).toBeUndefined();
    expect(JSON.stringify(image?.["settings"])).not.toMatch(/AI-generated/);
  });

  it("stamps a stock picture with its own licence and credit, not an AI credit", async () => {
    const stock = asset({ provider: "stock", path: "https://example.org/a.jpg", placement: ["about"], license: "cc-by", attribution: "Photo by Ada (CC BY)" });
    const { componentsOf } = await build({
      generatedAssets: [stock],
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "about", heading: "About", body: "We detail cars." }, { role: "contact" }] },
      ]),
    });
    const visual = (componentsOf("about")[0]?.["settings"] as { visual?: Record<string, unknown> }).visual ?? {};
    expect(visual).toMatchObject({ source: "stock", credit: "Photo by Ada (CC BY)", license: "cc-by" });
  });

  it("offers a gallery only when the owner has at least three real work photos", async () => {
    const { candidatePageInventory, ownerWorkPhotoCount } = await import("@/lib/site-materialize.server");
    const roles = (count: number) =>
      candidatePageInventory({ ...input, ownerWorkPhotoCount: count }, "Get a price").flatMap((page) => page.sections.map((s) => s.role));
    expect(roles(2)).not.toContain("gallery");
    expect(roles(3)).toContain("gallery");
    const work = (n: number) => asset({ provider: "owner", category: "work", slot: `owner-${n}`, placement: ["gallery", "work"] });
    expect(ownerWorkPhotoCount([work(1), work(2), asset({ provider: "openai" }), asset({ provider: "owner", category: "hero", placement: ["hero"] })])).toBe(2);
  });

  it("writes FAQ answers and benefits only into sections that asked for them", async () => {
    const { componentsOf } = await build({
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [
          { role: "hero" },
          { role: "faq", heading: "Questions", includes: ["faqs"] },
          { role: "why_us", heading: "Why us", custom: true, includes: ["benefits"] },
          { role: "contact" },
        ] },
      ]),
    });
    expect(componentsOf("faq")).toEqual([
      expect.objectContaining({ kind: "faq_item", label: "How long does it take?", body: "About two hours." }),
    ]);
    expect(componentsOf("why_us").map((row) => [row["kind"], row["label"]])).toEqual([
      ["list_item", "We come to you"],
      ["list_item", "Fixed prices"],
    ]);
  });

  it("never gives a sub-page the home description", async () => {
    const description = "Full mobile detail in Tampa: interior shampoo, exterior hand wash and wax, done at your home or office, booked online in a couple of minutes.";
    const { tables } = await build({
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "contact" }] },
        { slug: "about", title: "About", purpose: "story", primaryAction: "Get a price", sections: [{ role: "story", heading: "Our story", body: "We started in Tampa." }] },
        { slug: "services", title: "Services", purpose: "services", primaryAction: "Get a price", seoTitle: "Mobile detailing services in Tampa", seoDescription: description, sections: [{ role: "services", heading: "What we do", includes: ["service_cards"] }] },
      ]),
    });
    const bySlug = new Map(tables.website_pages!.map((row) => [row["slug"], row]));
    expect(bySlug.get("home")).toMatchObject({ seo_description: "Book a mobile detail in Tampa." });
    expect(bySlug.get("about")).toMatchObject({ seo_title: null, seo_description: null, og_description: null });
    expect(bySlug.get("services")).toMatchObject({ seo_title: "Mobile detailing services in Tampa", seo_description: description, og_description: description });
  });

  it("never deals leftover AI pictures into gallery or testimonial roles", async () => {
    const generated = [1, 2, 3, 4].map((n) => asset({ slot: `ai-${n}`, label: `AI ${n}`, path: `org/ai-${n}.png` }));
    const { componentsOf } = await build({
      generatedAssets: generated,
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [
          { role: "hero", media: "required" },
          { role: "gallery", media: "required" },
          { role: "testimonials", heading: "Kind words", custom: true, media: "required" },
          { role: "contact" },
        ] },
      ]),
    });
    expect(componentsOf("gallery")).toEqual([]);
    expect(componentsOf("testimonials")).toEqual([]);
    expect(componentsOf("hero").filter((row) => row["media_url"]).length).toBe(4);
  });

  it("matches a service card picture by the service the AI named, not the label", async () => {
    const picture = asset({ slot: "service-interior", label: "Seats being shampooed", path: "org/interior.png" });
    const { componentsOf } = await build({
      generatedAssets: [picture],
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "services", heading: "What we do", includes: ["service_cards"] }, { role: "contact" }] },
      ]),
    });
    // Without a serviceName the label does not match, so the card has no picture.
    expect(componentsOf("services").find((row) => row["kind"] === "card")?.["media_url"] ?? null).toBeNull();
    const named = await build({
      generatedAssets: [{ ...picture, serviceName: "full detail" }],
      architect: plan([
        { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "services", heading: "What we do", includes: ["service_cards"] }, { role: "contact" }] },
      ]),
    });
    expect(named.componentsOf("services").find((row) => row["kind"] === "card")?.["media_url"]).toBe("org/interior.png");
  });

  it("stops with a retryable error naming a visible page that has no sections", async () => {
    let calls = 0;
    const { materializeSiteContent } = await import("@/lib/site-materialize.server");
    const { db } = fakeDb();
    const empty: PageArchitecture[] = [
      { slug: "home", title: "Home", purpose: "home", primaryAction: "Get a price", sections: [{ role: "hero" }, { role: "contact" }] },
      { slug: "gallery", title: "Gallery", purpose: "work", primaryAction: "Get a price", sections: [] },
    ];
    await expect(
      materializeSiteContent(db, "org-1", { ...input, architect: async () => { calls += 1; return empty; } }),
    ).rejects.toThrow(/"gallery" page has no sections/);
    expect(calls).toBe(2);
  });
});


