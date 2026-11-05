/**
 * Static responsive checks on every catalog category's generated output
 * (deterministic path, no AI): the device matrix (responsive-matrix) at every
 * width it covers, 320 through 2560. Pixel geometry (overflow, clipping,
 * blank gaps) needs browser measurements and stays NOT_VERIFIED here.
 */
import { describe, expect, it } from "vitest";
import { PLAYBOOK_CATALOG } from "@/lib/builder/playbook-catalog.generated";
import type { MaterializeInput } from "@/lib/site-materialize.server";
import { DEVICE_MATRIX, evaluateDeviceMatrix, type MatrixSite } from "@/lib/builder/responsive-matrix";
import { scaffoldRequiredCopy } from "@/lib/builder/copy-scaffold";

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
  const raw = rawInputFor(slug, partial);
  // The wording step's facts-only scaffold runs before materialize (site-engine worker).
  const { copy } = scaffoldRequiredCopy(raw.copy, {
    businessName: raw.businessName,
    description: null,
    city: raw.city,
    state: raw.state,
    serviceArea: raw.serviceArea,
    services: raw.services,
  });
  return { ...raw, copy };
}

function rawInputFor(slug: string, partial: boolean): MaterializeInput {
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


const ITEM_KINDS = new Set(["service_card", "list_item", "faq_item", "card", "step", "stat"]);

async function generate(slug: string, partial: boolean) {
  const { materializeSiteContent } = await import("@/lib/site-materialize.server");
  const { db, tables } = fakeDb();
  await materializeSiteContent(db, `org-${slug}`, inputFor(slug, partial));
  return tables;
}

function matrixSite(tables: ReturnType<typeof fakeDb>["tables"]): MatrixSite {
  const order = (r: Row) => Number(r["sort_order"] ?? 0);
  return {
    navItemCount: tables.website_pages.length,
    pages: tables.website_pages.map((p) => ({
      id: String(p["id"]),
      title: (p["title"] as string) ?? null,
      sections: tables.website_sections
        .filter((s) => s["page_id"] === p["id"])
        .sort((a, b) => order(a) - order(b))
        .map((s) => {
          const comps = tables.website_components.filter((c) => c["section_id"] === s["id"]);
          return {
            id: String(s["id"]),
            kind: String(s["kind"]),
            heading: (s["heading"] as string) ?? null,
            subheading: (s["subheading"] as string) ?? null,
            body: (s["body"] as string) ?? null,
            componentCount: comps.length,
            itemCount: comps.filter((c) => ITEM_KINDS.has(String(c["kind"]))).length,
            hasMedia: comps.some((c) => Boolean(c["media_url"])),
          };
        }),
    })),
  };
}

const REQUIRED_WIDTHS = [320, 768, 1440, 1920, 2560];

describe("category static matrix (deterministic path)", () => {
  const slugs = PLAYBOOK_CATALOG.map((entry) => entry.slug);

  it("the device matrix covers 320, 768, 1440, 1920 and 2560", () => {
    const widths = DEVICE_MATRIX.map((d) => d.width);
    for (const width of REQUIRED_WIDTHS) expect(widths).toContain(width);
  });

  for (const partial of [false, true]) {
    it.each(slugs)(`%s (${partial ? "partial" : "full"}) passes the device-matrix composition checks at every width`, async (slug) => {
      const checks = evaluateDeviceMatrix(matrixSite(await generate(slug, partial)));
      for (const width of REQUIRED_WIDTHS) expect(checks.some((c) => c.width === width)).toBe(true);
      // The opening-visual check depends on pictures, which this no-photo fixture has none of.
      const fails = checks.filter((c) => c.verdict === "FAIL" && c.check !== "opening section has a main visual");
      expect(fails.map((c) => `${c.width} ${c.check}: ${c.detail}`)).toEqual([]);
      // Geometry is never claimed without a browser measurement.
      expect(checks.filter((c) => c.check === "no horizontal overflow").every((c) => c.verdict === "NOT_VERIFIED")).toBe(true);
    });
  }
});
