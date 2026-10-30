import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Scheduled worker for onboarding + retention emails (welcome, setup reminder,
 * booking follow-up, win-back). Hourly from pg_cron `revora-lifecycle-email`
 * (migration 20261030150000); this is the only code path that sends them.
 * POST only, bearer-authenticated with the cron secret; the lifecycle log
 * makes repeated runs safe.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLifecycleEmails } = await import("@/lib/lifecycle-email.server");

  try {
    const result = await runLifecycleEmails(supabaseAdmin as never, { limit: 500, max: 25 });
    return Response.json(result);
  } catch (error) {
    console.error("[lifecycle email worker]", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Lifecycle email run failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/lifecycle-email")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: ({ request }) => handle(request),
    },
  },
});
