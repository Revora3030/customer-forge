/**
 * Scheduled Jarvis routines.
 *
 * Called by the platform scheduler with the cron bearer secret. Runs each due
 * routine as its owner through the normal Jarvis chat loop, so approvals,
 * model routing and spend caps are unchanged. Routines never execute write
 * proposals themselves — those still wait for owner approval in chat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/jarvis-routines")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDueJarvisRoutines } = await import("@/lib/jarvis-routines.server");
        try {
          return Response.json(await runDueJarvisRoutines(supabaseAdmin as never));
        } catch (error) {
          const { captureError } = await import("@/lib/monitoring.server");
          captureError(error, { route: "jobs/jarvis-routines" });
          return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
