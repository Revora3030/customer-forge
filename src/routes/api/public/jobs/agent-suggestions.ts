import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Daily PAI-21 suggestion pass for every live workspace (SQL signals, no AI,
 * nothing sent). Bearer-authenticated with the cron secret and called by
 * GitHub Actions (.github/workflows/scheduled-jobs.yml). Safe to repeat.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { supabaseSuggestionRepo } = await import("@/lib/agent/suggestions.server");
  const { runSuggestionsJob, supabaseLiveOrgLister } = await import("@/lib/agent/suggestions-job.server");
  try {
    return Response.json(await runSuggestionsJob(supabaseLiveOrgLister(supabaseAdmin), supabaseSuggestionRepo(supabaseAdmin)));
  } catch (error) {
    console.error("[agent-suggestions job]", error);
    return Response.json({ error: "agent-suggestions failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/agent-suggestions")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
