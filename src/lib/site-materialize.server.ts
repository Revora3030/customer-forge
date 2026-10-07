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
import { pageNavLabel, safeLinkUrl } from "@/lib/website-content";
import { effectForKind, type DesignDirection } from "@/lib/authored-direction";
import { writeSectionEffect } from "@/lib/site-effects";
import { writeComponentVisual } from "@/lib/site-style";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.server";
import type { CreativeBrief } from "@/lib/builder/first-build-contract";
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
import { adaptMissingMedia, assertMediaIntegrity } from "@/lib/builder/media-integrity";

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
  /** Approved Sol/Terra presentation brief, compiled into a renderer contract. */
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
  /**
   * The architect's plan, already started by the caller (so it runs in
   * parallel with picture generation). Takes precedence over `architect`.
   */
  architecture_?: Promise<PageArchitecture[] | null>;
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

function primaryActionTarget(input: {
  authoredTarget: string;
  architecture: PageArchitecture[];
  hasQuoteForm: boolean;
  hasBooking: boolean;
}): string {
  const action = input.authoredTarget.toLowerCase();
  const roles = new Set(
    input.architecture.flatMap((page) => page.sections.map((section) => section.role)),
  );
  const hasQuote = input.hasQuoteForm && roles.has("quote");
  const hasBooking = input.hasBooking && roles.has("booking");
  const hasContact = roles.has("contact");
  if (hasBooking && /\b(book|booking|schedule|appointment|reserve)\b/.test(action)) return "/book";
  if (hasQuote && /\b(quote|estimate|price|pricing|cost|proposal)\b/.test(action)) return "/#quote";
  if (hasContact && /\b(call|contact|email|message|talk|consult)\b/.test(action)) return "/contact";
  // The wording didn't name a capability, but the AI still asked for an action.
  // Point it at a capability this business really has rather than discarding
  // the whole build. Nothing is invented: each target only exists when the
  // matching real section and capability are present.
  // If no capability matches, point to the home page rather than throwing.
  // The customer should always get a complete site.
  if (hasBooking) return "/book";
  if (hasQuote) return "/#quote";
  if (hasContact) return "/contact";
  return "/";

}

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

/**
 * Gives every newly generated section a complete, renderable design contract.
 * This runs during first-site generation, rather than waiting for the owner to
 * ask the assistant to redesign an otherwise generic template.
 */
export function materializedSectionDesign(
  kind: string,
  direction: DesignDirection | null | undefined,
  _index = 0,
  _creativeBrief?: CreativeBrief | null,
): { variant: string; settings: Record<string, unknown> } {
  // No stamped defaults: layout, card style, image treatment and width are
  // written only by the AI (its design contract and later compositions). The
  // only thing carried here is the motion effect the AI's own brand identity
  // authored.
  if (!direction) return { variant: "default", settings: {} };
  const effect = effectForKind(direction, kind);
  return { variant: "default", settings: effect ? writeSectionEffect({}, effect) : {} };
}

/**
 * Writes the tree for an organisation. Returns counts, and `skipped: true` when
 * the workspace already has pages unless an owner/admin explicitly requested a
 * fresh rebuild and the caller already captured a restorable backup.
 */

/**
 * The candidate page inventory the AI architect starts from, built only from
 * verified business facts. Exported so the worker can start the architect in
 * parallel with picture generation (it does not depend on the pictures).
 */
export function candidatePageInventory(
  input: Pick<MaterializeInput, "businessName" | "copy" | "services" | "hasBooking" | "hasQuoteForm">,
  primaryAction: string,
): PageArchitecture[] {
  const functionalSections = [
    ...(input.hasQuoteForm ? [{ role: "quote" }] : []),
    ...(input.hasBooking ? [{ role: "booking" }] : []),
    { role: "contact" },
  ];
  // Pillar 4 — Multi-page commercial depth.
  // The candidate inventory seeds a complete commercial site, not a single
  // home page, so the AI architect starts from real multi-page material it can
  // reorder, expand or invent on top of. Every page is built only from verified
  // business DNA facts: services come from the real service rows, contact comes
  // from the enquiry capability, and the about page never invents credentials.
  const hasServices = input.services.length > 0;
  // Pillar 4 — Multi-page commercial depth.
  // The candidate inventory seeds a complete commercial site, not a single
  // home page, so the AI architect starts from real multi-page material it can
  // reorder, expand or invent on top of. Every page is built only from verified
  // business DNA facts: services come from the real service rows, contact comes
  // from the enquiry capability, and the about page never invents credentials.
  // When the AI architect fails and this inventory becomes the fallback, the
  // sections carry real headings and includes so the site is complete, not a
  // skeleton of empty role-only sections.
  return [
    {
      slug: "home",
      title: input.businessName,
      purpose: "primary website entry",
      primaryAction,
      sections: [
        { role: "hero", heading: input.copy.heroHeadline || input.businessName, subheading: input.copy.heroSubheadline || null, media: "required", includes: ["primary_action"] },
        ...(hasServices ? [{ role: "services", heading: "Our Services", subheading: null, includes: ["service_cards"] as ("primary_action" | "service_cards")[] }] : []),
        { role: "process", heading: "How It Works", subheading: null },
        { role: "social_proof", heading: null, subheading: null },
        { role: "faq", heading: "Common Questions", subheading: null },
        ...functionalSections,
      ],
    },
    // Dedicated services page: a full breakdown of real offerings with scope,
    // deliverables and direct booking. Only seeded when the business has real
    // service rows; the AI can still invent a services page without them.
    ...(hasServices
      ? [{
          slug: "services",
          title: "Services",
          purpose: "detailed service breakdown and booking",
          primaryAction,
          sections: [
            { role: "services", heading: `${input.businessName} Services`, subheading: null, includes: ["service_cards"] as ("primary_action" | "service_cards")[] },
            ...(input.hasBooking ? [{ role: "booking" }] : []),
            { role: "contact" },
          ],
        }]
      : []),
    // About / story page: commercial backstory and values, sourced only from
    // verified business DNA facts. Never invents awards, team credentials or
    // certifications the business has not supplied.
    {
      slug: "about",
      title: "About",
      purpose: "business story, values and service territory",
      primaryAction,
      sections: [
        { role: "story", heading: `About ${input.businessName}`, subheading: null, body: input.copy.about || null },
        { role: "values", heading: "Our Values", subheading: null },
        { role: "service_area", heading: input.copy.areaCopy ? "Where We Serve" : null, subheading: null, body: input.copy.areaCopy || null },
        { role: "contact" },
      ],
    },
    // Contact & booking page: high-converting lead intake with operating hours,
    // direct phone/address and the booking widget when available.
    {
      slug: input.hasBooking ? "book" : "contact",
      title: input.hasBooking ? "Book" : "Contact",
      purpose: "lead intake, booking and direct contact",
      primaryAction,
      sections: [
        ...(input.hasQuoteForm ? [{ role: "quote" }] : []),
        ...(input.hasBooking ? [{ role: "booking" }] : []),
        { role: "contact" },
      ],
    },
  ];
}

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
  if ((count ?? 0) > 0 && !input.replaceExisting)
    return { pages: 0, sections: 0, components: 0, skipped: true, designContract: null };
  // A fresh rebuild clears the old site only AFTER the AI architect, design
  // contract and media checks below have all succeeded (see clearExisting),
  // so a failure in any of them leaves the customer's current site untouched.
  const clearExisting = async () => {
    if (!((count ?? 0) > 0 && input.replaceExisting)) return;
    const { error: componentDeleteError } = await db.from("website_components").delete().eq("organization_id", orgId);
    if (componentDeleteError)
      throw new Error(`Couldn't clear old components before rebuilding: ${componentDeleteError.message}`);
    const { error: sectionDeleteError } = await db.from("website_sections").delete().eq("organization_id", orgId);
    if (sectionDeleteError)
      throw new Error(`Couldn't clear old sections before rebuilding: ${sectionDeleteError.message}`);
    const { error: pageDeleteError } = await db.from("website_pages").delete().eq("organization_id", orgId);
    if (pageDeleteError)
      throw new Error(`Couldn't clear old pages before rebuilding: ${pageDeleteError.message}`);
  };

  // The renderer produces safe building blocks; the AI design decides the site.
  // The contract OVERRIDES the renderer's page set and section order, and any
  // visual container the design requires must resolve to a real picture —
  // otherwise the build fails rather than publishing a blank box.
  // The main call to action is the AI team's wording; a build without one
  // stops instead of shipping a stock label.
  const primaryAction = clean(input.copy.primaryCta);
  if (!primaryAction) {
    const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
    throw new AiStepUnavailableError("main call to action", "no label was authored");
  }
  const factInventory = candidatePageInventory(input, primaryAction);
  let designContract: AiDesignContract | null = input.designContract ?? null;
  const authored = designContract
    ? null
    : input.architecture_
      ? await input.architecture_
      : input.architect
        ? await input.architect(factInventory)
        : null;
  if (!designContract && (input.architect || input.architecture_) && !authored?.length) {
    // The AI architect could not produce a plan. The fact inventory is only
    // material for the architect — it is never shipped as the site.
    const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
    throw new AiStepUnavailableError("page plan", "the architect returned no usable plan");
  }
  // The AI architect's plan, or the AI design contract's pages.
  const architecture: PageArchitecture[] =
    authored ??
    (designContract
      ? designContract.pages.map((page) => ({
          slug: page.slug,
          title: page.title,
          purpose: page.purpose,
          primaryAction: page.primaryAction,
          sections: page.sections.map((section) => ({
            role: section.role,
            layout: section.layout,
            intent: section.intent,
            media: section.media,
          })),
        }))
      : factInventory);
  // Functional safeguard (not a creative choice): every site must give visitors
  // a working way to send an enquiry, so leads reach the owner's lead inbox.
  // If the AI plan left out every enquiry section, add the strongest real
  // capability this business has to the home page instead of discarding the build.
  const enquiryRoles = new Set(["booking", "quote", "contact"]);
  if (!architecture.some((page) => page.sections.some((section) => enquiryRoles.has(section.role)))) {
    const home = architecture.find((page) => page.slug === "home") ?? architecture[0];
    if (home) {
      const role = input.hasBooking ? "booking" : input.hasQuoteForm ? "quote" : "contact";
      home.sections = [...home.sections, { role } as (typeof home.sections)[number]];
    }
  }
  const authoredPrimaryAction = architecture.find((page) => page.slug === "home")?.primaryAction ?? architecture[0]?.primaryAction ?? "";
  const primaryTarget = primaryActionTarget({
    authoredTarget: authoredPrimaryAction,
    architecture,
    hasQuoteForm: input.hasQuoteForm,
    hasBooking: input.hasBooking,
  });
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
  // Every page gets a picture: before spreading the rest, give each page that
  // still has none one leftover picture on its first picture-friendly section.
  for (const page of architecture) {
    if (!unassigned.length) break;
    const slots = contentSlots.filter((slot) => slot.page === page.slug);
    if (!slots.length) continue;
    if (slots.some((slot) => allocatedAssets.get(slotKey(slot.page, slot.role, slot.index))?.length)) continue;
    const pageWords = new Set([page.slug, ...page.slug.split("-"), ...slots.map((slot) => slot.role)]);
    const fit = unassigned.findIndex((asset) =>
      asset.placement.some((place) => pageWords.has(place) || place.startsWith(`${page.slug}:`)),
    );
    const [asset] = unassigned.splice(fit >= 0 ? fit : 0, 1);
    if (asset) claim(slots.find((slot) => slot.media !== "none") ?? slots[0]!, asset);
  }
  if (contentSlots.length)
    for (const [index, asset] of unassigned.entries()) claim(contentSlots[index % contentSlots.length]!, asset);
  let tree: Page[] = architecture.map((page) => ({
    slug: page.slug,
    title: page.slug === "home" ? page.title : pageNavLabel(page.title, input.businessName, page.slug),
    kind: page.slug === "home" ? "home" : "page",
    seo_title: page.slug === "home" ? clean(input.copy.metaTitle) : clean(`${pageNavLabel(page.title, input.businessName, page.slug)} — ${input.businessName}`),
    seo_description: clean(input.copy.metaDescription),
    og_title: page.slug === "home" ? clean(input.copy.ogTitle) : clean(`${pageNavLabel(page.title, input.businessName, page.slug)} — ${input.businessName}`),
    og_description: clean(input.copy.ogDescription),
    sections: page.sections.map((section, index) => {
      const role = section.role;
      if (["quote", "booking", "contact", "sticky_cta"].includes(role))
        return { kind: role, heading: section.heading ?? null, subheading: section.subheading ?? null, body: section.body ?? null };
      const matching = allocatedAssets.get(slotKey(page.slug, role, index)) ?? [];
      const components: Component[] = [];
      for (const asset of matching)
        components.push(imageComponent(asset, index === 0 ? "hero_image" : "image"));
      // Structure comes only from the AI's plan: material is attached only when
      // the section explicitly asked for it, never because of its name.
      const includes = section.includes ?? [];
      if (includes.includes("primary_action"))
        components.push({ kind: "button", label: primaryAction, link_label: primaryAction, link_url: primaryTarget });
      if (includes.includes("service_cards"))
        for (const service of input.services) {
          const asset = generatedByLabel.get(service.name.toLowerCase()) ?? null;
          components.push({
            kind: "card",
            label: service.name,
            body: clean(input.copy.serviceCards.find((card) => card.name === service.name)?.copy) ?? clean(service.description),
            // No per-service page is ever created, so a /services/<name> link
            // was a dead end. Point at the real services page when the plan
            // has one, otherwise at the enquiry path.
            link_url: architecture.some((candidate) => candidate.slug === "services")
              ? "/services"
              : primaryTarget,
            media_url: asset?.path ?? null,
            settings: asset ? mediaSettings(asset) : null,
          });
        }
      return { kind: role, heading: section.heading ?? null, subheading: section.subheading ?? null, body: section.body ?? null, components };
    }),
  }));
  let authoredArchitecture: PageArchitecture[] | null = null;
  if (!designContract && input.creativeBrief) {
    // The page set, section selection and order come from the design team's
    // own plan.
    authoredArchitecture = architecture;
    designContract = requireAiDesignContract({
      attempt: compileAiDesignContract({
        businessName: input.businessName,
        brief: input.creativeBrief,
        directedBy: input.directedBy ?? "gpt-6-sol",
        reviewedBy: input.reviewedBy ?? null,
        conversionGoal: input.conversionGoal?.trim() || null,
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
    // A blocked or rejected picture used to fail the entire first build with
    // "empty picture box". The affected sections are now redesigned text-led
    // (no placeholder is ever written), and only broken references still stop.
    const adapted = adaptMissingMedia(applied.pages, designContract);
    if (adapted.adapted.length)
      console.warn(
        `[site-materialize] ${adapted.adapted.length} section(s) built without a picture for ${orgId}: ` +
          adapted.adapted.map((entry) => `${entry.page}/${entry.section}`).join(", "),
      );
    designContract = adapted.contract;
    assertMediaIntegrity(adapted.pages, designContract);
    tree = adapted.pages as unknown as typeof tree;
  }
  if (authoredArchitecture) tree = applyAuthoredHeadings(tree, authoredArchitecture);
  await clearExisting();
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
