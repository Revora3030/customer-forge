import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Sentry health check. Sends one info-level test event and answers 200 only
 * when Sentry accepted it. Bearer-authenticated with the cron secret, so the
 * public can't spend the Sentry quota.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { checkSentryDelivery } = await import("@/lib/monitoring.server");
  const result = await checkSentryDelivery();
  return Response.json(result, { status: result.delivered ? 200 : 503 });
}

export const Route = createFileRoute("/api/public/sentry-test")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
