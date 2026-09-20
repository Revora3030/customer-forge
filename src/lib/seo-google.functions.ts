/**
 * Real Google data for the platform admin surface.
 *
 * Search growth advice comes from the connected Search Console account, and
 * local listing facts from Google Maps. Both are admin-only, both label the
 * source and exact fetch time, and neither ever returns a made-up number: if
 * Google has no data, or the account isn't authorized, that is what is
 * reported.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LocalListing } from "@/lib/integrations/google.server";
import type { SeoOpportunity } from "@/lib/seo-console";

export type GoogleDataFailure = {
  ok: false;
  /** Plain-language reason, safe to show as-is. */
  message: string;
  failure: string;
};

export type SearchConsoleResult =
  | { ok: true; status: "choose_property"; candidates: string[] }
  | {
      ok: true;
      status: "data";
      siteUrl: string;
      opportunities: SeoOpportunity[];
      totals: { clicks: number; impressions: number; rows: number };
      period: { start: string; end: string };
      fetchedAt: string;
    }
  | GoogleDataFailure;

async function guard(context: { supabase: unknown; userId: unknown }) {
  const { assertSuperAdmin } = await import("@/lib/admin.server");
  await assertSuperAdmin(
    context.supabase as Parameters<typeof assertSuperAdmin>[0],
    String(context.userId),
  );
}

async function explain(error: unknown): Promise<GoogleDataFailure> {
  const { GoogleDataError } = await import("@/lib/integrations/google.server");
  if (error instanceof GoogleDataError)
    return { ok: false, message: error.message, failure: error.failure };
  if (error instanceof Error && error.message === "Forbidden") throw error;
  return {
    ok: false,
    message: "Google didn't answer just now. Try again in a moment.",
    failure: "provider_error",
  };
}

/** Live search performance, turned into a ranked work list by Revora's own engine. */
export const getSearchConsoleGrowth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUrl: string; siteUrl?: string | null }) => ({
    targetUrl: String(input.targetUrl ?? "").slice(0, 300),
    siteUrl: input.siteUrl ? String(input.siteUrl).slice(0, 300) : null,
  }))
  .handler(async ({ data, context }): Promise<SearchConsoleResult> => {
    await guard(context);
    try {
      const { resolveProperty, searchPerformance } = await import(
        "@/lib/integrations/google.server"
      );
      const { seoOpportunities } = await import("@/lib/seo-console");
      const resolution = await resolveProperty(data.targetUrl, data.siteUrl);
      if (resolution.status === "selection_required")
        return { ok: true, status: "choose_property", candidates: resolution.candidates };

      const performance = await searchPerformance(resolution.siteUrl);
      return {
        ok: true,
        status: "data",
        siteUrl: performance.siteUrl,
        opportunities: seoOpportunities(performance.rows, 30),
        totals: {
          clicks: performance.rows.reduce((sum, row) => sum + row.clicks, 0),
          impressions: performance.rows.reduce((sum, row) => sum + row.impressions, 0),
          rows: performance.rows.length,
        },
        period: performance.period,
        fetchedAt: performance.fetchedAt,
      };
    } catch (error) {
      return explain(error);
    }
  });

export type LocalListingResult =
  | { ok: true; listings: LocalListing[] }
  | GoogleDataFailure;

/** Public Google listing facts for a business, straight from Maps. */
export const getLocalListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => ({ query: String(input.query ?? "").slice(0, 160) }))
  .handler(async ({ data, context }): Promise<LocalListingResult> => {
    await guard(context);
    try {
      const { localListings } = await import("@/lib/integrations/google.server");
      return { ok: true, listings: await localListings(data.query) };
    } catch (error) {
      return explain(error);
    }
  });
