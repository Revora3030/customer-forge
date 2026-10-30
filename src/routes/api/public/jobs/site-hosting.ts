import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Hourly (pg_cron `revora-site-hosting`, migration 20261030141000): canceled
 * workspaces' websites go offline 14 days after the subscription ended, with a
 * warning email 3 days before; resubscribed workspaces come back online.
 * Bearer-authenticated with the cron secret; safe to repeat.
 */
export const Route = createFileRoute("/api/public/jobs/site-hosting")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const [{ supabaseAdmin }, { runSiteHostingSweep }, { handleSiteOfflineWarning }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/site-hosting.server"),
          import("@/lib/billing-lifecycle.server"),
        ]);
        try {
          const result = await runSiteHostingSweep(supabaseAdmin as never, {
            warn: async (organizationId, offlineAfter) =>
              (await handleSiteOfflineWarning(supabaseAdmin, { organizationId, offlineAfter })).sent,
          });
          return Response.json(result);
        } catch (error) {
          console.error("[site-hosting job]", error instanceof Error ? error.message : "unknown");
          return Response.json({ error: "site-hosting failed" }, { status: 500 });
        }
      },
    },
  },
});
