/**
 * Every business category the generator supports (PLAYBOOK_CATALOG) must
 * materialize at least one visible page with real sections, and meet the
 * content checks of the publish readiness gate (pages, sections, a way to
 * enquire), on the deterministic path (no AI calls): an architect that
 * accepts the facts-only candidate as-is. Covered for a full profile and for a
 * partial one (no phone, email, place, services, quote form or booking).
 */
import { describe, expect, it } from "vitest";
import { PLAYBOOK_CATALOG } from "@/lib/builder/playbook-catalog.generated";
import type { MaterializeInput } from "@/lib/site-materialize.server";

type Row = Record<string, unknown>;

function fakeDb() {
  const tables: Record<"website_pages" | "website_sections" | "website_components", Row[]> = {
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
          const rows = (Array.isArray(value) ? value : [value]).map((row) => ({ id: `${table}-${++id}`, is_visible: true, ...row }));
          tables[table].push(...rows);
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

const label = (slug: string) => slug.replace(/-/g, " ");

function inputFor(slug: string, partial: boolean): MaterializeInput {
  const name = `Test ${label(slug)}`;
  return {
    businessName: name,
    copy: {
      heroHeadline: `${label(slug)} you can count on`,
      heroSubheadline: partial ? "" : "Local and reliable.",
      primaryCta: "Get in touch",
      secondaryCta: partial ? "" : "See services",
      intro: partial ? "" : `${name} serves local customers.`,
      about: partial ? "" : `${name} is locally owned.`,
      benefits: partial ? [] : ["Clear communication"],
      serviceCards: partial ? [] : [{ name: label(slug), copy: "Our main service." }],
      faqs: partial ? [] : [{ question: "How do I start?", answer: "Send us a message." }],
      areaCopy: partial ? "" : "We work across the area.",
      metaTitle: name,
      metaDescription: `${name}.`,
      ogTitle: name,
      ogDescription: `${name}.`,
    },
    services: partial ? [] : [{ name: label(slug), description: null, price: null, starting_price: null }],
    city: partial ? null : "Tampa",
    state: partial ? null : "FL",
    serviceArea: null,
    phone: partial ? null : "8135550123",
    email: partial ? null : "hi@example.test",
    yearsInBusiness: null,
    photoCount: 0,
    hasQuoteForm: !partial,
    hasBooking: false,
    architect: async (candidate) => candidate,
  };
}

const captureKinds = new Set(["quote", "booking", "contact", "cta", "sticky_cta"]);
const contactSlugs = new Set(["contact", "contact-us", "get-in-touch"]);

describe("category generation matrix (deterministic path)", () => {
  const slugs = PLAYBOOK_CATALOG.map((entry) => entry.slug);

  it("covers the whole catalog", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(50);
  });

  for (const partial of [false, true]) {
    it.each(slugs)(`%s (${partial ? "partial" : "full"} profile) builds visible pages that pass the readiness content checks`, async (slug) => {
      const { materializeSiteContent } = await import("@/lib/site-materialize.server");
      const { db, tables } = fakeDb();
      const result = await materializeSiteContent(db, `org-${slug}`, inputFor(slug, partial));
      expect(result.skipped).toBe(false);
      const pages = tables.website_pages.filter((p) => p["is_visible"] !== false);
      const sections = tables.website_sections.filter((s) => s["is_visible"] !== false);
      // (a) never the empty "being updated" state.
      expect(pages.length).toBeGreaterThanOrEqual(1);
      const home = pages.find((p) => p["slug"] === "home") ?? pages[0]!;
      expect(sections.some((s) => s["page_id"] === home["id"])).toBe(true);
      // (b) the content checks of gatherReadiness.
      expect(sections.length).toBeGreaterThanOrEqual(3);
      expect(
        sections.some((s) => captureKinds.has(String(s["kind"]))) || pages.some((p) => contactSlugs.has(String(p["slug"]))),
      ).toBe(true);
    });
  }
});
