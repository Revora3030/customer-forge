import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends every page revoragrowthsystems.com publishes in its sitemap to
 * IndexNow. Super admin only: it speaks for Revora's own domain.
 */
export const submitPlatformToIndexNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { INDEXNOW_ENDPOINT, describeIndexNowStatus, indexNowKey, indexNowPayload } = await import(
      "@/lib/indexnow"
    );
    const { sitemapUrls } = await import("@/lib/site-host.server");
    const { SITE_URL } = await import("@/lib/seo");

    const payload = indexNowPayload(
      SITE_URL,
      sitemapUrls(null, SITE_URL).map((entry) => entry.loc),
      indexNowKey(process.env.INDEXNOW_KEY),
    );
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      return { ...describeIndexNowStatus(response.status), submitted: payload.urlList.length };
    } catch {
      return { ok: false, message: "Revora couldn't reach IndexNow just now. Try again in a moment.", submitted: 0 };
    }
  });
