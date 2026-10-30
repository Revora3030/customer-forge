import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Every 10 minutes (pg_cron `revora-automation-runs`, migration
 * 20261030120000): deliver automation follow-ups that have come due in any
 * workspace. Bearer-authenticated with the cron secret; safe to repeat.
 */
export const Route = createFileRoute("/api/public/jobs/automation-runs")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const [{ supabaseAdmin }, { runDueAutomationSweep }, { deliverRun }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/automation-sweep.server"),
          import("@/lib/messaging.server"),
        ]);
        try {
          const result = await runDueAutomationSweep(supabaseAdmin as never, {
            deliverFor: (ctx) => (run) => deliverRun(run, ctx),
          });
          return Response.json(result);
        } catch (error) {
          console.error("[automation-runs job]", error instanceof Error ? error.message : "unknown");
          return Response.json({ error: "automation-runs failed" }, { status: 500 });
        }
      },
    },
  },
});
