/**
 * The God Body visual standard, checked statically on every catalog
 * category's generated output (deterministic path: materialize + facts-only
 * fallback layouts, no AI, no network), rendered with the public renderer:
 *
 * - dark studio palette: categories whose trade blueprint is dark (or that
 *   have no blueprint, which keeps the original obsidian studio) render no
 *   light background on any section; "dark-to-light" blueprints keep the
 *   opening section dark. Blueprints authored as light (quality bar #22) are
 *   reported, not failed: that is the product's own per-trade decision.
 * - full-bleed: no element carries both a background and a max-width (a boxed
 *   band); section surfaces are painted by the full-width section wrapper.
 * - scroll choreography: every non-lead content section carries a scroll
 *   reveal or motion class.
 * - the section design audit (design-quality) passes on those fallback layouts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYBOOK_CATALOG } from "@/lib/builder/playbook-catalog.generated";
import type { MaterializeInput } from "@/lib/site-materialize.server";
import { fallbackSectionComposition } from "@/lib/builder/fallback-sections";
import { scaffoldRequiredCopy } from "@/lib/builder/copy-scaffold";
import { FUNCTIONAL_SECTION_KINDS } from "@/lib/builder/first-build-compositions.server";
import { blueprintFor } from "@/lib/builder/industry-playbook";
import { prepareStudioPage, studioLightPalette, STUDIO_CANVAS } from "@/lib/builder/studio-canvas";
import { auditPageDesign } from "@/lib/builder/design-quality";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";

type Row = Record<string, unknown>;

function fakeDb() {
  const tables: Record<"website_pages" | "website_sections" | "website_components", Row[]> = { website_pages: [], website_sections: [], website_components: [] };
  let id = 0;
  const db = {
    from(table: keyof typeof tables) {
      return {
        select: () => ({ eq: async () => ({ count: 0, error: null }) }),
        insert(value: Row | Row[]) {
          const rows = (Array.isArray(value) ? value : [value]).map((row) => ({ id: `${table}-${++id}`, is_visible: true, ...row }));
          tables[table].push(...rows);
          const result = { data: rows[0], error: null };
          return { select: () => ({ single: async () => result }), then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, tables };
}

const label = (slug: string) => slug.replace(/-/g, " ");

function inputFor(slug: string, partial: boolean): MaterializeInput {
  const name = `Test ${label(slug)}`;
  const raw: MaterializeInput = {
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
  const { copy } = scaffoldRequiredCopy(raw.copy, { businessName: raw.businessName, description: null, city: raw.city, state: raw.state, serviceArea: raw.serviceArea, services: raw.services });
  return { ...raw, copy };
}

type RenderedSection = { page: string; kind: string; lead: boolean; light: boolean; html: string };
type Audit = string[];

async function renderSite(slug: string, partial: boolean): Promise<{ tone: string; transition: string; sections: RenderedSection[]; audit: Audit }> {
  const { materializeSiteContent } = await import("@/lib/site-materialize.server");
  const { db, tables } = fakeDb();
  const input = inputFor(slug, partial);
  await materializeSiteContent(db, `org-${slug}`, input);
  const facts = { businessName: input.businessName, services: input.services.map((s) => s.name), city: input.city, region: input.state, phone: input.phone, email: input.email };
  const contact = tables.website_pages.find((p) => ["contact", "book", "booking", "quote", "contact-us"].includes(String(p["slug"])) || /contact|book|quote/i.test(String(p["kind"] ?? "")));
  const enquiryHref = contact ? `/${contact["slug"]}` : null;
  // Same canvas choice as SitePageView.
  const blueprint = blueprintFor(slug);
  const studioCanvas = blueprint && blueprint.tone === "dark" ? blueprint.palette : null;
  const light = blueprint?.studioTransition === "dark-to-light" ? studioLightPalette(studioCanvas) : null;
  const canvas = studioCanvas?.canvas ?? STUDIO_CANVAS;
  const out: RenderedSection[] = [];
  const audit: Audit = [];
  for (const page of tables.website_pages) {
    const sections = tables.website_sections
      .filter((s) => s["page_id"] === page["id"] && !FUNCTIONAL_SECTION_KINDS.has(String(s["kind"])))
      .sort((a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0));
    const trees: CompositionTree[] = sections.map((s, i) =>
      fallbackSectionComposition(
        { id: String(s["id"]), kind: String(s["kind"]), heading: (s["heading"] as string) ?? null, subheading: (s["subheading"] as string) ?? null, body: (s["body"] as string) ?? null, components: tables.website_components.filter((c) => c["section_id"] === s["id"]) as never },
        { facts, lead: i === 0, seed: slug, enquiryHref },
      ),
    );
    for (const [id, findings] of Object.entries(auditPageDesign(trees.map((tree, i) => ({ id: String(sections[i]!["id"]), role: String(sections[i]!["kind"]), tree })))))
      for (const f of findings) audit.push(`${page["slug"]}/${sections.find((s) => String(s["id"]) === id)?.["kind"]}: ${f.code}`);
    const studio = prepareStudioPage(trees.map((t) => t.root), blueprint?.tone !== "light", blueprint?.studioTransition ?? "dark-only", light);
    studio.roots.forEach((root, i) => {
      if (!root) return;
      const isLight = studio.lightFrom != null && i >= studio.lightFrom;
      const surface = isLight && light ? light.canvas : studio.studio ? canvas : null;
      const html = renderToStaticMarkup(<CompositionRenderer tree={{ ...trees[i]!, root }} scope={`s${i}`} surface={surface} resolveWidget={(name) => <span data-test-widget={name} />} />).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
      out.push({ page: String(page["slug"]), kind: String(sections[i]!["kind"]), lead: i === 0, light: isLight, html });
    });
  }
  return { tone: blueprint?.tone ?? "none", transition: blueprint?.studioTransition ?? "dark-only", sections: out, audit };
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const styles = (html: string) => [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]!.replace(/&quot;/g, '"'));
const backgrounds = (style: string) => [...style.matchAll(/background(?:-color)?:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => m[1]!);

describe("category standard matrix (dark studio, full-bleed, scroll choreography)", () => {
  const slugs = PLAYBOOK_CATALOG.map((entry) => entry.slug);
  for (const partial of [false, true]) {
    it.each(slugs)(`%s (${partial ? "partial" : "full"}) meets the visual standard`, async (slug) => {
      const site = await renderSite(slug, partial);
      const problems: string[] = [...site.audit];
      for (const s of site.sections) {
        const where = `${s.page}/${s.kind}`;
        // Dark studio palette: no light band on a dark studio surface.
        if (site.tone !== "light" && !s.light)
          for (const style of styles(s.html)) for (const bg of backgrounds(style)) if (luminance(bg) > 0.2) problems.push(`${where}: light background ${bg}`);
        // Full-bleed: a painted band is never boxed by a max-width.
        for (const style of styles(s.html)) if (backgrounds(style).length && /max-width:/.test(style)) problems.push(`${where}: boxed background`);
        // Scroll choreography off the lead.
        if (!s.lead && !/rv-cn-auto|rv-cn-motion|data-motion="/.test(s.html)) problems.push(`${where}: no scroll reveal`);
      }
      expect(problems).toEqual([]);
    });
  }
});
