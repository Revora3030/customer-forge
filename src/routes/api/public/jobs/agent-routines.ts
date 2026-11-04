/**
 * Scheduled owner routines (PAI-17). Called every few minutes by the platform
 * scheduler with the cron bearer secret. Starts an agent run for each due
 * routine; the runs themselves are advanced by jobs/agent-runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const Route = createFileRoute("/api/public/jobs/agent-routines")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDueAgentRoutines, supabaseRoutineRepo } = await import("@/lib/agent/routines.server");
        try {
          return Response.json(await runDueAgentRoutines(supabaseRoutineRepo(supabaseAdmin)));
        } catch (error) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError(error, { route: "jobs/agent-routines" });
          return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
