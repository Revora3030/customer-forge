/**
 * Records the result of a real-browser visual check.
 *
 * The browser collects raw measurements; this function never trusts a score
 * the browser computed. It validates the shape, re-grades the measurements
 * with the shared grader, and stores both — so a tampered client can only ever
 * lower its own reported quality, never raise it.
 *
 * Every visitor-visible page is stored as its own row, and the site-level
 * verdict only passes when each of those pages was measured.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gradeSite, gradeVisual } from "@/lib/builder/visual";

const accessibilitySchema = z
  .object({
    imagesMissingAlt: z.array(z.string().max(200)).max(20),
    unlabeledControls: z.array(z.string().max(200)).max(20),
    unlabeledInputs: z.array(z.string().max(200)).max(20),
    headingOrderProblems: z.array(z.string().max(200)).max(20),
    h1Count: z.number().int().min(0).max(200),
    hasMain: z.boolean(),
    hasNav: z.boolean(),
    controls: z.number().int().min(0).max(5000),
    keyboardReachable: z.number().int().min(0).max(5000),
    lowContrast: z
      .array(z.object({ selector: z.string().max(200), ratio: z.number().finite() }))
      .max(20),
    zoomBlocked: z.boolean(),
  })
  .optional();

const performanceSchema = z
  .object({
    devServer: z.boolean().optional(),
    ttfb: z.number().finite().nullable(),
    fcp: z.number().finite().nullable(),
    lcp: z.number().finite().nullable(),
    cls: z.number().finite().nullable(),
    inp: z.number().finite().nullable(),
    longTasks: z.number().finite().nullable(),
    resources: z.number().finite().min(0),
    scriptBytes: z.number().finite().min(0),
    imageBytes: z.number().finite().min(0),
    fontBytes: z.number().finite().min(0),
    failedRequests: z.number().finite().min(0),
    oversizedImages: z.array(z.string().max(200)).max(20),
    renderBlocking: z.number().finite().min(0),
  })
  .optional();

const measurementSchema = z.object({
  width: z.number().finite().min(200).max(4000),
  scrollWidth: z.number().finite().min(0),
  overflowing: z
    .array(z.object({ selector: z.string().max(120), right: z.number().finite() }))
    .max(20),
  brokenImages: z.array(z.string().max(200)).max(20),
  clipped: z.array(z.string().max(120)).max(20),
  smallTargets: z
    .array(
      z.object({
        selector: z.string().max(120),
        width: z.number().finite(),
        height: z.number().finite(),
      }),
    )
    .max(20),
  tinyText: z
    .array(z.object({ selector: z.string().max(120), fontSize: z.number().finite() }))
    .max(20),
  unreachable: z.array(z.string().max(120)).max(20),
  navigable: z.boolean(),
  ctas: z.number().int().min(0),
  deadControls: z.array(z.string().max(160)).max(20).optional(),
  distortedImages: z.array(z.string().max(200)).max(20).optional(),
  overlapping: z.array(z.string().max(200)).max(20).optional(),
  narrowColumns: z.array(z.string().max(160)).max(20).optional(),
  stickyFooterHeight: z.number().finite().min(0).max(4000).optional(),
  accessibility: accessibilitySchema,
  performance: performanceSchema,
});

const pageSchema = z.object({
  /** The website page this belongs to, e.g. `home` or `services`. */
  pageSlug: z.string().min(1).max(80),
  pageUrl: z.string().min(1).max(300),
  measurements: z.array(measurementSchema).min(1).max(20),
});

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  /** Every visitor-visible page slug, so an unmeasured page fails the site. */
  expectedPages: z.array(z.string().min(1).max(80)).min(1).max(40),
  pages: z.array(pageSchema).min(1).max(40),
});

export const recordVisualCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only someone who can manage the workspace may record its quality gate.
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership?.role || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Only an owner, admin or manager can run the visual check.");
    }

    // Re-grade from the raw measurements — the submitted numbers are evidence,
    // never a verdict.
    const perPage = data.pages.map((page) => ({
      page: page.pageSlug,
      report: gradeVisual(page.measurements, page.pageSlug),
    }));
    const site = gradeSite(data.expectedPages, perPage);

    const writer = supabase as unknown as {
      from: (table: string) => {
        insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await writer.from("website_visual_reports").insert(
      data.pages.map((page, index) => ({
        organization_id: data.organizationId,
        page_slug: page.pageSlug,
        page_url: page.pageUrl,
        measurements: page.measurements,
        report: perPage[index]?.report ?? null,
      })),
    );
    if (error) throw new Error("The visual check result could not be saved. Please try again.");

    return { report: site, pages: perPage };
  });
