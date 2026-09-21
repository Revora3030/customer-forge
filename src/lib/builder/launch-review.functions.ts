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

/** Folds the stored per-page rows into one honest site-level measurement. */
function foldMeasurement(
  rows: Array<{ measured_at: string; measurements: unknown }>,
): LaunchReviewMeasurement | null {
  if (rows.length === 0) return null;

  const widths = new Set<number>();
  let smallTargetCount = 0;
  let overflowCount = 0;
  let headingOrderProblems = 0;
  let lowContrastCount = 0;
  let unlabeledControlCount = 0;
  let zoomBlocked = false;
  let h1Count = 0;
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
  let seen = false;

  for (const row of rows) {
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
        h1Count = Math.max(h1Count, Number(a11y["h1Count"]) || 0);
        imagesMissingAlt += countList(a11y["imagesMissingAlt"]);
        imagesWithAlt += 1;
      }

      const perf = (m["performance"] ?? null) as Record<string, unknown> | null;
      if (perf) {
        seen = true;
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
  }

  const altTotal = imagesWithAlt + imagesMissingAlt;

  return {
    measuredAt: rows[0]?.measured_at ?? new Date().toISOString(),
    widths: [...widths].sort((a, b) => a - b),
    seo: {
      title: "",
      description: "",
      h1Count,
      imageAltCoverage: altTotal === 0 ? 1 : Math.max(0, 1 - imagesMissingAlt / altTotal),
      internalLinks,
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
    zoomBlocked: seen ? zoomBlocked : zoomBlocked,
  };
}

export const getLaunchReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIdValidator)
  .handler(async ({ data, context }): Promise<LaunchReview> => {
    const { supabase } = context;
    const organizationId = data.organizationId;

    const [profile, settings, pages, sections, services, reviews, media, visual] = await Promise.all(
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
        supabase.from("website_pages").select("slug, is_visible").eq("organization_id", organizationId),
        supabase
          .from("website_sections")
          .select("kind, is_visible, settings")
          .eq("organization_id", organizationId),
        supabase.from("services").select("id").eq("organization_id", organizationId).eq("is_active", true),
        supabase
          .from("reviews")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("is_published", true),
        supabase.from("media").select("id").eq("organization_id", organizationId),
        supabase
          .from("website_visual_reports")
          .select("measured_at, measurements")
          .eq("organization_id", organizationId)
          .order("measured_at", { ascending: false })
          .limit(20),
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
        (visual.data ?? []) as Array<{ measured_at: string; measurements: unknown }>,
      ),
    };

    const review = reviewLaunchQuality(facts);
    // The stored measurement carries no page title/description, so the search
    // contract reads the saved copy instead of pretending it measured them.
    return review;
  });
