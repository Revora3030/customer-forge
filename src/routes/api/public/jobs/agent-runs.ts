/**
 * Worker kick for durable agent runs (PAI-2).
 *
 * Called every minute by the platform scheduler with the cron bearer secret.
 * Recovers runs whose worker was cut off, then advances queued runs through the
 * registered executor. With no executor registered yet it only recovers.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const Route = createFileRoute("/api/public/jobs/agent-runs")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDueAgentRuns, supabaseRunRepo, getAgentRunExecutor } = await import("@/lib/agent/run-store.server");
        try {
          const result = await runDueAgentRuns(supabaseRunRepo(supabaseAdmin), getAgentRunExecutor());
          return Response.json(result);
        } catch (error) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError(error, { route: "jobs/agent-runs" });
          return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
