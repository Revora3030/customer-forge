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
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const Route = createFileRoute("/api/public/jobs/jarvis-routines")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDueJarvisRoutines } = await import("@/lib/jarvis-routines.server");
        try {
          const routines = await runDueJarvisRoutines(supabaseAdmin as never);
          // Event nudges cost no AI spend (plain chat notices); a failure here never hides the routine result.
          const { runJarvisEventWatch } = await import("@/lib/jarvis-event-watch.server");
          const events = await runJarvisEventWatch(supabaseAdmin as never).catch((error: unknown) => {
            console.error("[jarvis-event-watch]", error);
            return { error: "event watch failed" };
          });
          return Response.json({ ...routines, events });
        } catch (error) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError(error, { route: "jobs/jarvis-routines" });
          return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
