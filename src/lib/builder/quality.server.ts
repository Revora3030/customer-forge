/**
 * Runs the website quality audit against the workspace's real rows.
 *
 * Nothing here writes: it reads the published pages, sections, business profile,
 * reviews and photos, normalises them through the presentation layer, and
 * returns the score plus the blockers that must be cleared before publishing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessFacts } from "./facts";
import { auditWebsite, type QualityInput, type QualityReport } from "./quality";
import { gradeSite, gradeVisual, VIEWPORTS, type VisualFinding, type VisualReport } from "./visual";
import { inspectRenderedEvidence } from "./rendered-evidence.mjs";

type Db = SupabaseClient<never>;

/**
 * A rendered check only proves the website as it looked WHEN IT RAN. Any page
 * or section saved afterwards makes the report stale, and a stale report never
 * counts as measured.
 */
export function freshVisualReport(
  row: Record<string, unknown> | null,
  contentUpdatedAt: (string | undefined)[],
): VisualReport | null {
  if (!row) return null;
  const measuredAt = Date.parse(String(row["measured_at"] ?? ""));
  if (!Number.isFinite(measuredAt)) return null;
  const latestEdit = contentUpdatedAt
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .reduce((latest, value) => Math.max(latest, value), 0);
  if (latestEdit > measuredAt) return null;
  // Re-grade from the stored raw measurements rather than trusting the stored
  // verdict: the same judgement runs everywhere, always.
  const evidence = inspectRenderedEvidence(row["measurements"], VIEWPORTS);
  if (!evidence.measurements.length) return null;
  let report: VisualReport;
  try {
    report = gradeVisual(evidence.measurements);
  } catch {
    return null;
  }
  const blockers: VisualFinding[] = [];
  const add = (key: string, detail: string) => {
    blockers.push({
      key,
      severity: "p0",
      detail,
      fix: "Run complete browser measurements for this page at every required width.",
      width: 0,
    });
  };
  if (evidence.invalidMeasurements) {
    add("malformed_visual_evidence", "The stored report contains malformed viewport measurements.");
  }
  if (evidence.missingWidths.length) {
    add("page_widths_not_measured", `This page was not checked at ${evidence.missingWidths.join(", ")}px.`);
  }
  if (evidence.missingAccessibilityWidths.length) {
    add("incomplete_accessibility_evidence", "Accessibility evidence is incomplete at one or more required widths.");
  }
  if (evidence.missingPerformanceWidths.length) {
    add("incomplete_performance_evidence", "Performance evidence is incomplete at one or more required widths.");
  }
  return {
    ...report,
    passed: report.passed && blockers.length === 0,
    score: blockers.length ? Math.min(report.score, 80) : report.score,
    findings: [...report.findings, ...blockers],
    coverage: {
      accessibility: evidence.missingAccessibilityWidths.length === 0,
      performance: evidence.missingPerformanceWidths.length === 0,
    },
  };
}

/**
 * Judges the WHOLE website from stored per-page reports. Each visible page needs
 * its own fresh measurements: a home-page report has never been evidence that
 * Services, Pricing or Contact render correctly, so an unmeasured or stale page
 * fails the site.
 */
export function freshSiteVisualReport(
  rows: Record<string, unknown>[],
  visiblePages: string[],
  contentUpdatedAt: (string | undefined)[],
): VisualReport {
  const expectedPages = [...new Set(visiblePages.map((page) => page.trim() || "home"))];
  const newest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (typeof row["page_slug"] !== "string") continue;
    const slug = row["page_slug"].trim() || "home";
    const at = Date.parse(String(row["measured_at"] ?? ""));
    if (!Number.isFinite(at)) continue;
    const current = newest.get(slug);
    const currentAt = current ? Date.parse(String(current["measured_at"] ?? "")) : -1;
    if (at > currentAt) newest.set(slug, row);
  }

  const reports: { page: string; report: VisualReport }[] = [];
  for (const page of expectedPages) {
    const report = freshVisualReport(newest.get(page) ?? null, contentUpdatedAt);
    if (report) reports.push({ page, report: { ...report, pages: [page] } });
  }
  return gradeSite(expectedPages, reports);
}

/** Audits one workspace's website. Every count comes from a real table. */
export async function auditWorkspaceWebsite(db: Db, orgId: string): Promise<QualityReport> {
  const client = db as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => Promise<{ data: unknown[] | null; error?: unknown }> & {
          eq: (column: string, value: unknown) => Promise<{ data: unknown[] | null; error?: unknown }>;
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error?: unknown }>;
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error?: unknown }>;
          };
        };
      };
    };
  };

  const [profile, org, pages, sections, reviews, media, quoteForms, bookable, visualRows] =
    await Promise.all([
      client.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
      client.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
      client
        .from("website_pages")
        .select("id, slug, title, seo_title, seo_description, is_visible, updated_at")
        .eq("organization_id", orgId),
      client
        .from("website_sections")
        .select("id, page_id, kind, heading, subheading, body, is_visible, updated_at")
        .eq("organization_id", orgId),
      client.from("reviews").select("id").eq("organization_id", orgId).eq("is_published", true),
      client.from("media").select("id").eq("organization_id", orgId),
      client.from("quote_forms").select("id").eq("organization_id", orgId).eq("is_active", true),
      client.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
      // Every page's most recent check, newest first.
      client
        .from("website_visual_reports")
        .select("page_slug, measurements, measured_at")
        .eq("organization_id", orgId)
        .order("measured_at", { ascending: false })
        .limit(200),
    ]);

  if ([profile, org, pages, sections, reviews, media, quoteForms, bookable, visualRows]
    .some((result) => result.error)) {
    throw new Error("Website quality could not be verified because a required database read failed. Try again before publishing.");
  }

  const profileRow = (profile.data ?? null) as Record<string, unknown> | null;
  const orgRow = (org.data ?? null) as Record<string, unknown> | null;
  const pageRows = ((pages.data ?? []) as Record<string, unknown>[]).filter(
    (page) => page["is_visible"] !== false,
  );
  const sectionRows = ((sections.data ?? []) as Record<string, unknown>[]).filter(
    (section) => section["is_visible"] !== false,
  );

  const facts = businessFacts(profileRow, orgRow?.["name"]);
  const reviewCount = (reviews.data ?? []).length;
  const galleryCount = (media.data ?? []).length;
  const hasQuote = (quoteForms.data ?? []).length > 0;
  const hasBooking = (bookable.data ?? []).length > 0;

  const input: QualityInput = {
    facts,
    raw: {
      phone: profileRow?.["phone"],
      email: profileRow?.["email"],
      hours: profileRow?.["hours"],
    },
    pages: pageRows.map((page) => ({
      slug: String(page["slug"] ?? ""),
      title: page["title"],
      sections: sectionRows.filter((section) => section["page_id"] === page["id"]).length,
    })),
    texts: sectionRows.flatMap((section) => [
      section["heading"],
      section["subheading"],
      section["body"],
    ]),
    navLabels: pageRows.map((page) => page["title"]),
    conversion: {
      hasPhone: !!facts.phone,
      hasBooking,
      hasQuote,
      hasContact: !!facts.email || sectionRows.some((s) => s["kind"] === "contact"),
    },
    reviewCount,
    galleryCount,
    showsReviews: sectionRows.some((section) => section["kind"] === "reviews"),
    showsGallery: sectionRows.some((section) => section["kind"] === "gallery"),
    metadata: pageRows.map((page) => ({
      title: page["seo_title"] ?? page["title"],
      description: page["seo_description"],
    })),
    // Layer 2 only counts when EVERY visible page has been checked in a real
    // browser and nothing on the site has changed since those checks ran.
    visual: freshSiteVisualReport(
      (visualRows.data ?? []) as Record<string, unknown>[],
      pageRows.map((page) => String(page["slug"] ?? "")),
      [
        ...pageRows.map((page) => page["updated_at"] as string | undefined),
        ...sectionRows.map((section) => section["updated_at"] as string | undefined),
      ],
    ),
  };

  return auditWebsite(input);
}
