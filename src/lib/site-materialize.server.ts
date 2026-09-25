/**
 * Turns a generated plan + copy into the real page/section/component rows the
 * builder edits and the public site renders.
 *
 * Without this step a build finishes with a plan stored in `website_settings`
 * but nothing to edit or publish. It only ever writes facts that were supplied
 * (services, phone, email, area, years in business) — never invented claims —
 * and it never overwrites a site that already has pages, so a rebuild can't
 * silently erase the owner's edits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeLinkUrl } from "@/lib/website-content";
import type { DesignDirection } from "@/lib/authored-direction";
import { writeSectionEffect } from "@/lib/site-effects";
import { writeComponentVisual, writeSectionVisual } from "@/lib/site-style";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.server";
import type { CreativeBrief } from "@/lib/builder/first-build-contract";
import { slugify } from "@/lib/format";
import {
  applyDesignContract,
  type AiDesignContract,
  type MaterialPage,
} from "@/lib/builder/ai-design-contract";
import {
  compileAiDesignContract,
  requireAiDesignContract,
  type PageArchitecture,
} from "@/lib/builder/creative-authority";
import { assertMediaIntegrity } from "@/lib/builder/media-integrity";

type Db = SupabaseClient;

type ServiceRow = {
  name: string;
  description?: string | null;
  price?: number | null;
  starting_price?: number | null;
};

type Copy = {
  heroHeadline: string;
  heroSubheadline: string;
  primaryCta: string;
  secondaryCta: string;
  intro: string;
  about: string;
  benefits: string[];
  serviceCards: { name: string; copy: string }[];
  faqs: { question: string; answer: string }[];
  areaCopy: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
};

export type MaterializeInput = {
  businessName: string;
  copy: Copy;
  services: ServiceRow[];
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  yearsInBusiness: number | null;
  photoCount: number;
  hasQuoteForm: boolean;
  hasBooking: boolean;
  /** The industry-specific visual identity selected for this first build. */
  direction?: DesignDirection | null;
  /** The kind of website this business needs (restaurant, clinic, shop …). */
  /** Complete composition identity resolved before first materialization. */
  fingerprint?: DesignFingerprint | null;
  /** Approved Sol/Terra presentation brief, compiled into a finite renderer contract. */
  creativeBrief?: CreativeBrief | null;
  /** Safe generated starter pictures saved in tenant media for this first build. */
  generatedAssets?: FirstBuildImageAsset[];
  /** Explicit, guarded replacement mode. Default rebuilds remain non-destructive. */
  replaceExisting?: boolean;
  /** Model that directed the design, recorded on the contract for observability. */
  directedBy?: string | null;
  /** Model that independently reviewed the design, when one did. */
  reviewedBy?: string | null;
  /** The conversion goal the design is built around. */
  conversionGoal?: string | null;
  /**
   * The AI's canonical design. When supplied it is the creative authority: it
   * decides which pages exist, which sections appear and in what order, and the
   * renderer only supplies safe building blocks. An empty required visual
   * container fails the build instead of shipping a blank box.
   */
  designContract?: AiDesignContract | null;
  /**
   * Lets the AI author page architecture from a facts-only capability inventory.
   * Returning null is a hard failure.
   */
  architect?: (candidate: PageArchitecture[]) => Promise<PageArchitecture[] | null>;
};

type Component = {
  kind: string;
  label?: string | null;
  body?: string | null;
  link_label?: string | null;
  link_url?: string | null;
  media_url?: string | null;
  settings?: Record<string, unknown> | null;
};

type Section = {
  kind: string;
  variant?: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  components?: Component[];
};

type Page = {
  slug: string;
  title: string;
  kind: string;
  seo_title?: string | null;
  seo_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  sections: Section[];
};

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text.length ? text : null;
};

const GENERATED_IMAGE_CREDIT = "AI-generated starter image";

function mediaSettings(asset: FirstBuildImageAsset): Record<string, unknown> {
  return writeComponentVisual(
    {},
    {
      alt: asset.altText,
      // Treatment (overlay, radius, shadow, crop) is the AI composition's call;
      // the materializer records only the objective defaults a picture needs.
      object_fit: "cover",
      object_position: "center",
      overlay: "none",
      aspect_ratio: asset.aspectRatio,
      source: "generated",
      credit: GENERATED_IMAGE_CREDIT,
      license: "Revora starter image",
    },
  );
}

function imageComponent(asset: FirstBuildImageAsset, kind = "image"): Component {
  return {
    kind,
    label: asset.label,
    media_url: asset.path,
    settings: mediaSettings(asset),
  };
}



/**
 * Section headings are the AI's words. Every section except a page's opening
 * takes the heading the AI wrote for it — or none — so no built-in heading
 * ("What we do", "Common questions" …) ever reaches a first build.
 */
export function applyAuthoredHeadings(pages: Page[], architecture: PageArchitecture[]): Page[] {
  const bySlug = new Map(architecture.map((page) => [page.slug, page]));
  return pages.map((page) => {
    const plan = bySlug.get(page.slug);
    if (!plan) return page;
    const used = new Map<string, number>();
    return {
      ...page,
      sections: page.sections.map((section) => {
        if (section.kind === "sticky_cta") return section;
        const n = used.get(section.kind) ?? 0;
        used.set(section.kind, n + 1);
        const authored = plan.sections.filter((entry) => entry.role === section.kind)[n];
        if (page.slug === "home" && section.kind === "hero") return section;
        // Page openings already carry AI-written copy or the real service name;
        // the AI may still retitle them.
        if (section.kind === "hero")
          return authored?.heading ? { ...section, heading: authored.heading, subheading: authored.subheading ?? section.subheading ?? null } : section;
        return { ...section, heading: authored?.heading ?? null, subheading: authored?.subheading ?? null };
      }),
    };
  });
}

/** Builds the page tree. Pure — easy to reason about and to test. */
/**
 * Adds the sections and pages the AI invented as real material, carrying only
 * the AI's own words, so the contract can place them and the composition pass
 * can design them. Nothing is added that the AI did not write.
 */
export function addInventedMaterial(pages: Page[], architecture: PageArchitecture[]): Page[] {
  const bySlug = new Map(pages.map((page) => [page.slug, { ...page, sections: [...page.sections] }]));
  for (const design of architecture) {
    const custom = design.sections.filter((section) => section.custom);
    if (!custom.length) continue;
    const page = bySlug.get(design.slug) ?? { slug: design.slug, title: design.title, kind: "page", sections: [] };
    for (const section of custom)
      page.sections.push({ kind: section.role, heading: section.heading ?? null, subheading: section.subheading ?? null, body: section.body ?? null, components: [] });
    bySlug.set(design.slug, page);
  }
  return [...bySlug.values()];
}

/**
 * Gives every newly generated section a complete, renderable design contract.
 * This runs during first-site generation, rather than waiting for the owner to
 * ask the assistant to redesign an otherwise generic template.
 */
export function materializedSectionDesign(
  kind: string,
  direction: DesignDirection | null | undefined,
  _fingerprint?: DesignFingerprint | null,
  _index = 0,
  _creativeBrief?: CreativeBrief | null,
): { variant: string; settings: Record<string, unknown> } {
  // No stamped defaults: layout, card style, image treatment and width are
  // written only by the AI (its design contract and later compositions). The
  // only thing carried here is the motion effect the AI's own brand identity
  // authored.
  if (!direction) return { variant: "default", settings: {} };
  const effect =
    kind === "hero"
      ? direction.heroEffect
      : kind === "cta" || kind === "offer" || kind === "sticky_cta"
        ? direction.ctaEffect
        : kind === "quote" || kind === "booking" || kind === "contact"
          ? direction.formEffect
          : direction.bodyEffect;
  return { variant: "default", settings: effect ? writeSectionEffect({}, effect) : {} };
}

/**
 * Writes the tree for an organisation. Returns counts, and `skipped: true` when
 * the workspace already has pages unless an owner/admin explicitly requested a
 * fresh rebuild and the caller already captured a restorable backup.
 */
export async function materializeSiteContent(
  db: Db,
  orgId: string,
  input: MaterializeInput,
): Promise<{
  pages: number;
  sections: number;
  components: number;
  skipped: boolean;
  /** The AI design this site was built from, when one governed the build. */
  designContract: AiDesignContract | null;
}> {
  const { count } = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) > 0) {
    if (!input.replaceExisting)
      return { pages: 0, sections: 0, components: 0, skipped: true, designContract: null };
    const { error: componentDeleteError } = await db.from("website_components").delete().eq("organization_id", orgId);
    if (componentDeleteError)
      throw new Error(`Couldn't clear old components before rebuilding: ${componentDeleteError.message}`);
    const { error: sectionDeleteError } = await db.from("website_sections").delete().eq("organization_id", orgId);
    if (sectionDeleteError)
      throw new Error(`Couldn't clear old sections before rebuilding: ${sectionDeleteError.message}`);
    const { error: pageDeleteError } = await db.from("website_pages").delete().eq("organization_id", orgId);
    if (pageDeleteError)
      throw new Error(`Couldn't clear old pages before rebuilding: ${pageDeleteError.message}`);
  }

  // The renderer produces safe building blocks; the AI design decides the site.
  // The contract OVERRIDES the renderer's page set and section order, and any
  // visual container the design requires must resolve to a real picture —
  // otherwise the build fails rather than publishing a blank box.
  const primaryAction = clean(input.copy.primaryCta) ?? "Get in touch";
  const functionalSections = [
    ...(input.hasQuoteForm ? [{ role: "quote" }] : []),
    ...(input.hasBooking ? [{ role: "booking" }] : []),
    { role: "contact" },
    { role: "sticky_cta" },
  ];
  const factInventory: PageArchitecture[] = [{
    slug: "home",
    title: input.businessName,
    purpose: "primary website entry",
    primaryAction,
    sections: [
      { role: "hero" },
      ...(input.services.length ? [{ role: "services" }] : []),
      ...functionalSections,
    ],
  }];
  let designContract: AiDesignContract | null = input.designContract ?? null;
  const authored = designContract
    ? null
    : input.architect
      ? await input.architect(factInventory)
      : null;
  if (!designContract && !authored?.length)
    throw new Error("The design team could not author this website's page plan, so nothing was created. Please try again in a moment.");
  const architecture: PageArchitecture[] = authored ?? designContract!.pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    purpose: page.purpose,
    primaryAction: page.primaryAction,
    sections: page.sections.map((section) => ({ role: section.role, layout: section.layout, intent: section.intent, media: section.media })),
  }));
  const primaryTarget = input.hasQuoteForm ? "/#quote" : input.hasBooking ? "/book" : "/contact";
  const generatedByLabel = new Map((input.generatedAssets ?? []).map((asset) => [asset.label.toLowerCase(), asset]));
  const contentSlots = architecture.flatMap((page) =>
    page.sections
      .filter((section) => !["quote", "booking", "contact", "sticky_cta"].includes(section.role))
      .map((section, index) => ({ page: page.slug, role: section.role, index, media: section.media })),
  );
  const allocatedAssets = new Map<string, FirstBuildImageAsset[]>();
  const slotKey = (page: string, role: string, index: number) => `${page}:${role}:${index}`;
  const claim = (slot: (typeof contentSlots)[number], asset: FirstBuildImageAsset) => {
    const key = slotKey(slot.page, slot.role, slot.index);
    allocatedAssets.set(key, [...(allocatedAssets.get(key) ?? []), asset]);
  };
  const unassigned = [...(input.generatedAssets ?? [])];
  for (const slot of contentSlots) {
    const exact = unassigned.findIndex((asset) =>
      asset.placement.some((placement) => placement === slot.role || placement === `${slot.page}:${slot.role}`),
    );
    if (exact >= 0) {
      const [asset] = unassigned.splice(exact, 1);
      if (asset) claim(slot, asset);
    }
  }
  for (const slot of contentSlots.filter((entry) => entry.media === "required")) {
    const key = slotKey(slot.page, slot.role, slot.index);
    if (!(allocatedAssets.get(key)?.length) && unassigned.length) {
      const asset = unassigned.shift();
      if (asset) claim(slot, asset);
    }
  }
  if (contentSlots.length)
    for (const [index, asset] of unassigned.entries()) claim(contentSlots[index % contentSlots.length]!, asset);
  let tree: Page[] = architecture.map((page) => ({
    slug: page.slug,
    title: page.title,
    kind: page.slug === "home" ? "home" : "page",
    seo_title: page.slug === "home" ? clean(input.copy.metaTitle) : clean(`${page.title} — ${input.businessName}`),
    seo_description: clean(input.copy.metaDescription),
    og_title: page.slug === "home" ? clean(input.copy.ogTitle) : clean(page.title),
    og_description: clean(input.copy.ogDescription),
    sections: page.sections.map((section, index) => {
      const role = section.role;
      if (["quote", "booking", "contact", "sticky_cta"].includes(role))
        return { kind: role, heading: section.heading ?? null, subheading: section.subheading ?? null, body: section.body ?? null };
      const matching = allocatedAssets.get(slotKey(page.slug, role, index)) ?? [];
      const components: Component[] = [];
      for (const asset of matching)
        components.push(imageComponent(asset, index === 0 ? "hero_image" : "image"));
      if (/hero|cta|action|conversion/i.test(role))
        components.push({ kind: "button", label: primaryAction, link_label: primaryAction, link_url: primaryTarget });
      if (/services|offers|solutions/i.test(role))
        for (const service of input.services) {
          const asset = generatedByLabel.get(service.name.toLowerCase()) ?? null;
          components.push({
            kind: "card",
            label: service.name,
            body: clean(input.copy.serviceCards.find((card) => card.name === service.name)?.copy) ?? clean(service.description),
            link_url: `/services/${slugify(service.name)}`,
            media_url: asset?.path ?? null,
            settings: asset ? mediaSettings(asset) : null,
          });
        }
      return { kind: role, heading: section.heading ?? null, subheading: section.subheading ?? null, body: section.body ?? null, components };
    }),
  }));
  let authoredArchitecture: PageArchitecture[] | null = null;
  if (!designContract && input.fingerprint && input.creativeBrief) {
    // No template fallback: the page set, section selection and order come from
    // the design team's own plan. When it could not author one, the build stops
    // and says so rather than shipping the renderer's inventory as a design.
    if (!authored || authored.length === 0) {
      throw new Error(
        "The design team could not author this website's page plan, so nothing was created. Please try again in a moment.",
      );
    }
    authoredArchitecture = architecture;
    designContract = requireAiDesignContract({
      attempt: compileAiDesignContract({
        businessName: input.businessName,
        fingerprint: input.fingerprint,
        brief: input.creativeBrief,
        directedBy: input.directedBy ?? "gpt-6-sol",
        reviewedBy: input.reviewedBy ?? null,
        conversionGoal: input.conversionGoal ?? "enquiries",
        navigationItems: architecture.map((page) => page.title),
        primaryAction,
        secondaryAction: clean(input.copy.secondaryCta),
        architecture,
      }),
      attempts: 1,
    });
  }
  if (designContract) {
    const applied = applyDesignContract(tree as unknown as MaterialPage[], designContract);
    assertMediaIntegrity(applied.pages, designContract);
    tree = applied.pages as unknown as typeof tree;
  }
  if (authoredArchitecture) tree = applyAuthoredHeadings(tree, authoredArchitecture);
  let sections = 0;
  let components = 0;

  for (const [pageIndex, page] of tree.entries()) {
    const { data: pageRow, error: pageError } = await db
      .from("website_pages")
      .insert({
        organization_id: orgId,
        slug: page.slug,
        title: page.title,
        kind: page.kind,
        sort_order: pageIndex,
        is_visible: true,
        noindex: false,
        seo_title: page.seo_title ?? null,
        seo_description: page.seo_description ?? null,
        og_title: page.og_title ?? null,
        og_description: page.og_description ?? null,
        og_image_url: page.og_image_url ?? null,
      } as never)
      .select("id")
      .single();
    if (pageError) throw new Error(pageError.message);

    for (const [sectionIndex, section] of page.sections.entries()) {
      const design = materializedSectionDesign(
        section.kind,
        input.direction,
        input.fingerprint,
        pageIndex * 37 + sectionIndex,
        input.creativeBrief,
      );
      const { data: sectionRow, error: sectionError } = await db
        .from("website_sections")
        .insert({
          organization_id: orgId,
          page_id: (pageRow as { id: string }).id,
          kind: section.kind,
          variant: section.variant ?? design.variant,
          heading: section.heading ?? null,
          subheading: section.subheading ?? null,
          body: section.body ?? null,
          is_visible: true,
          sort_order: sectionIndex,
          settings: design.settings,
        } as never)
        .select("id")
        .single();
      if (sectionError) throw new Error(sectionError.message);
      sections += 1;

      const rows = (section.components ?? []).map((component, index) => ({
        organization_id: orgId,
        section_id: (sectionRow as { id: string }).id,
        kind: component.kind,
        label: component.label ?? null,
        body: component.body ?? null,
        media_url: component.media_url ?? null,
        link_label: component.link_label ?? null,
        link_url: safeLinkUrl(component.link_url ?? null),
        settings: component.settings ?? {},
        sort_order: index,
        is_visible: true,
      }));
      if (rows.length) {
        const { error } = await db.from("website_components").insert(rows as never);
        if (error) throw new Error(error.message);
        components += rows.length;
      }
    }
  }

  return { pages: tree.length, sections, components, skipped: false, designContract };
}
