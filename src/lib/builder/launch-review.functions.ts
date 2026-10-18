/**
 * Server side of the launch review.
 *
 * Reads only this workspace's own rows through the caller's session, so RLS
 * decides what is visible. Real-browser evidence comes from the stored
 * website_visual_reports rows — never from anything the client claims now.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readSeo } from "@/lib/site-seo";
import { readComposition } from "./composition-tree";
import {
  reviewLaunchQuality,
  type LaunchReview,
  type LaunchReviewFacts,
  type LaunchReviewMeasurement,
} from "./launch-review";

const orgIdValidator = (input: { organizationId: string }) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
  return { organizationId };
};

const LEGAL_SLUGS = ["privacy", "privacy-policy", "terms", "terms-of-service"];
const CTA_KINDS = new Set(["cta", "sticky_cta", "quote", "booking", "contact"]);
const CAPTURE_KINDS = new Set(["quote", "booking", "contact"]);

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countList(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Site-level H1 count from per-page counts. Returns 1 only when every measured
 * page has exactly one H1 (min === max === 1); a page with none, or with
 * several, can no longer be hidden behind another page's single H1.
 */
export function foldH1Counts(perPage: number[]): number {
  if (perPage.length === 0) return 0;
  const min = Math.min(...perPage);
  const max = Math.max(...perPage);
  if (min === 1 && max === 1) return 1;
  return min === 0 ? 0 : max;
}

/** Folds the stored per-page rows into one honest site-level measurement. */
export function foldMeasurement(
  rows: Array<{ measured_at: string; measurements: unknown; page_slug?: string | null }>,
  copy: { title: string; description: string },
): LaunchReviewMeasurement | null {
  if (rows.length === 0) return null;

  const widths = new Set<number>();
  let smallTargetCount = 0;
  let overflowCount = 0;
  let headingOrderProblems = 0;
  let lowContrastCount = 0;
  let unlabeledControlCount = 0;
  let zoomBlocked = false;
  // Newest row per page wins (rows arrive newest first).
  const h1ByPage = new Map<string, number>();
  let imagesWithAlt = 0;
  let imagesMissingAlt = 0;
  let internalLinks = 0;
  let scriptBytes = 0;
  let cssBytes = 0;
  let imageBytes = 0;
  let resources = 0;
  let lcp: number | null = null;
  let cls: number | null = null;
  let inp: number | null = null;

  rows.forEach((row, rowIndex) => {
    const pageKey = row.page_slug ? `page:${row.page_slug}` : `row:${rowIndex}`;
    const seenPage = h1ByPage.has(pageKey);
    let rowH1: number | null = null;
    const list = Array.isArray(row.measurements) ? row.measurements : [];
    for (const raw of list) {
      const m = (raw ?? {}) as Record<string, unknown>;
      const width = Number(m["width"]);
      if (Number.isFinite(width)) widths.add(width);
      smallTargetCount += countList(m["smallTargets"]);
      overflowCount += countList(m["overflowing"]);
      internalLinks = Math.max(internalLinks, Number(m["ctas"]) || 0);

      const a11y = (m["accessibility"] ?? null) as Record<string, unknown> | null;
      if (a11y) {
        headingOrderProblems += countList(a11y["headingOrderProblems"]);
        lowContrastCount += countList(a11y["lowContrast"]);
        unlabeledControlCount +=
          countList(a11y["unlabeledControls"]) + countList(a11y["unlabeledInputs"]);
        if (a11y["zoomBlocked"] === true) zoomBlocked = true;
        rowH1 = Math.max(rowH1 ?? 0, Number(a11y["h1Count"]) || 0);
        imagesMissingAlt += countList(a11y["imagesMissingAlt"]);
        imagesWithAlt += 1;
      }

      const perf = (m["performance"] ?? null) as Record<string, unknown> | null;
      if (perf) {
        scriptBytes = Math.max(scriptBytes, Number(perf["scriptBytes"]) || 0);
        cssBytes = Math.max(cssBytes, Number(perf["cssBytes"]) || 0);
        imageBytes = Math.max(imageBytes, Number(perf["imageBytes"]) || 0);
        resources = Math.max(resources, Number(perf["resources"]) || 0);
        const rawLcp = Number(perf["lcp"]);
        if (Number.isFinite(rawLcp)) lcp = Math.max(lcp ?? 0, rawLcp);
        const rawCls = Number(perf["cls"]);
        if (Number.isFinite(rawCls)) cls = Math.max(cls ?? 0, rawCls);
        const rawInp = Number(perf["inp"]);
        if (Number.isFinite(rawInp)) inp = Math.max(inp ?? 0, rawInp);
      }
    }
    if (!seenPage && rowH1 !== null) h1ByPage.set(pageKey, rowH1);
  });

  const h1Count = foldH1Counts([...h1ByPage.values()]);
  const altTotal = imagesWithAlt + imagesMissingAlt;

  return {
    measuredAt: rows[0]?.measured_at ?? new Date().toISOString(),
    widths: [...widths].sort((a, b) => a - b),
    seo: {
      // The browser measures structure; the wording comes from the saved copy
      // that the page actually renders.
      title: copy.title,
      description: copy.description,
      h1Count,
      imageAltCoverage: altTotal === 0 ? 1 : Math.max(0, 1 - imagesMissingAlt / altTotal),
      internalLinks,
      // Code-verified: every published customer homepage renders LocalBusiness
      // JSON-LD (src/routes/s.$slug.tsx).
      structuredData: true,
    },
    performance: {
      htmlBytes: 0,
      jsBytes: scriptBytes,
      cssBytes,
      requestCount: resources,
      ...(lcp === null ? {} : { largestContentfulPaintMs: lcp }),
      ...(cls === null ? {} : { cumulativeLayoutShift: cls }),
      ...(inp === null ? {} : { interactionToNextPaintMs: inp }),
    },
    smallTargetCount,
    overflowCount,
    headingOrderProblems,
    lowContrastCount,
    unlabeledControlCount,
    zoomBlocked,
  };
}

/** Score of the newest passing visual report stamped with the current revision. */
export function currentPassingVisualScore(
  rows: Array<{ report: unknown; revision_hash: string | null }>,
  revision: string | null,
): number | null {
  if (!revision) return null;
  for (const row of rows) {
    if (row.revision_hash !== revision) continue;
    const report = (row.report ?? {}) as { passed?: unknown; score?: unknown };
    if (report.passed === true && typeof report.score === "number") return report.score;
    return null; // newest report for this revision failed
  }
  return null;
}

export const getLaunchReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orgIdValidator)
  .handler(async ({ data, context }): Promise<LaunchReview> => {
    const { supabase } = context;
    const organizationId = data.organizationId;

    const [profile, settings, pages, sections, services, reviews, media, visual, components] = await Promise.all(
      [
        supabase
          .from("business_profiles")
          .select(
            "description, tagline, city, service_area, hero_image_url, certifications, awards, years_in_business, phone, email, primary_color, testimonials",
          )
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabase
          .from("website_settings")
          .select("seo, generation, custom_domain, domain_verified, domain_status, traffic_alerts_enabled")
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabase.from("website_pages").select("id, slug, title, is_visible").eq("organization_id", organizationId),
        supabase
          .from("website_sections")
          .select("id, page_id, kind, is_visible, settings, sort_order")
          .eq("organization_id", organizationId),
        supabase
          .from("services")
          .select("id, name, description, price, starting_price")
          .eq("organization_id", organizationId)
          .eq("is_active", true),
        supabase
          .from("reviews")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("is_published", true),
        supabase.from("media").select("id, url, source").eq("organization_id", organizationId),
        supabase
          .from("website_visual_reports")
          .select("measured_at, measurements, report, revision_hash, page_slug")
          .eq("organization_id", organizationId)
          .order("measured_at", { ascending: false })
          .limit(20),
        supabase
          .from("website_components")
          .select("section_id, kind, media_url, is_visible")
          .eq("organization_id", organizationId),
      ],
    );

    const p = (profile.data ?? {}) as Record<string, unknown>;
    const seo = readSeo(settings.data?.seo);
    const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
    const pageRows = (pages.data ?? []).filter((page) => page.is_visible);
    const visibleSections = (sections.data ?? []).filter((section) => section.is_visible);

    let faqCount = 0;
    for (const section of visibleSections) {
      if (String(section.kind) !== "faq") continue;
      const config = (section.settings ?? {}) as Record<string, unknown>;
      faqCount += countList(config["items"] ?? config["faqs"] ?? config["questions"]);
    }

    const credentialCount =
      (text(p["certifications"]).trim() ? 1 : 0) +
      (text(p["awards"]).trim() ? 1 : 0) +
      (Number(p["years_in_business"]) > 0 ? 1 : 0);

    const facts: LaunchReviewFacts = {
      headline: text(seo.headline),
      subheadline: text(seo.subheadline),
      metaDescription: text(seo.meta_description),
      primaryCtaLabel: text(seo.primary_cta_label),
      businessDescription: text(p["description"]) || text(p["tagline"]),
      audience: text((generation["audience"] as string) ?? ""),
      city: text(p["city"]),
      serviceArea: text(p["service_area"]),
      serviceCount: (services.data ?? []).length,
      faqCount,
      reviewCount: (reviews.data ?? []).length + countList(p["testimonials"]),
      credentialCount,
      imageCount: (media.data ?? []).length,
      hasProcessSection: visibleSections.some((section) =>
        ["process", "steps", "how_it_works", "timeline"].includes(String(section.kind)),
      ),
      hasHeroImage: !!text(p["hero_image_url"]).trim(),
      visualDirectionSet: !!generation["fingerprint"] || !!generation["creative"] || !!text(p["primary_color"]).trim(),
      ctaSectionCount: visibleSections.filter((section) => CTA_KINDS.has(String(section.kind))).length,
      captureSectionPresent: visibleSections.some((section) => CAPTURE_KINDS.has(String(section.kind))),
      legalPagesPresent: pageRows.some((page) => LEGAL_SLUGS.includes(String(page.slug))),
      analyticsConfigured: settings.data?.traffic_alerts_enabled === true,
      contactRouteVerified: !!(text(p["phone"]).trim() || text(p["email"]).trim()),
      customDomainConnected: !!settings.data?.custom_domain && settings.data?.domain_verified === true,
      measurement: foldMeasurement(
        (visual.data ?? []) as Array<{ measured_at: string; measurements: unknown; page_slug?: string | null }>,
        { title: text(seo.headline), description: text(seo.meta_description) },
      ),
    };

    // Visual design only counts with a PASSING check for the CURRENT revision.
    // The settings read above went through RLS, so reaching here with a row
    // proves the caller belongs to this organization before the privileged read.
    if (settings.data) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: revision }, { data: org }] = await Promise.all([
        supabaseAdmin.rpc("current_site_revision", { _organization_id: organizationId }),
        supabaseAdmin.from("organizations").select("slug").eq("id", organizationId).maybeSingle(),
      ]);
      facts.publicAddressAvailable = !!org?.slug;
      facts.visualCheckScore = currentPassingVisualScore(
        (visual.data ?? []) as Array<{ report: unknown; revision_hash: string | null }>,
        typeof revision === "string" ? revision : null,
      );
    }

    // The stored site, so empty picture boxes, stock photos without credit,
    // placeholder legal pages, priced services without inclusions and empty
    // galleries block launch.
    const allSections = (sections.data ?? []) as Array<{ id: string; page_id: string; kind: string; is_visible: boolean | null; settings: unknown; sort_order: number | null }>;
    const allComponents = (components.data ?? []) as Array<{ section_id: string; kind: string; media_url: string | null; is_visible: boolean | null }>;
    const pageList = (pages.data ?? []) as Array<{ id: string; slug: string; title: string | null; is_visible: boolean | null }>;
    const sectionsFor = (pageId: string) =>
      allSections
        .filter((section) => section.page_id === pageId)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    facts.pages = pageList.map((page) => ({
      slug: page.slug,
      visible: page.is_visible,
      sections: sectionsFor(page.id).map((section) => ({
        kind: String(section.kind),
        visible: section.is_visible,
        components: allComponents
          .filter((component) => component.section_id === section.id)
          .map((component) => ({ kind: component.kind, media_url: component.media_url, visible: component.is_visible })),
      })),
    }));
    facts.mediaSources = ((media.data ?? []) as Array<{ url: string | null; source: string | null }>)
      .filter((row) => Boolean(row.url))
      .map((row) => ({ url: row.url as string, source: row.source }));
    facts.completeness = {
      pages: pageList
        .filter((page) => page.is_visible)
        .map((page) => ({
          slug: page.slug,
          title: page.title,
          trees: sectionsFor(page.id)
            .filter((section) => section.is_visible !== false)
            .map((section) => readComposition(section.settings))
            .filter((tree): tree is NonNullable<typeof tree> => tree !== null),
        })),
      services: ((services.data ?? []) as Array<{ name: string; description: string | null; price: number | null; starting_price: number | null }>).map(
        (service) => ({ name: service.name, description: service.description, price: service.price, startingPrice: service.starting_price }),
      ),
    };

    return reviewLaunchQuality(facts);
  });
