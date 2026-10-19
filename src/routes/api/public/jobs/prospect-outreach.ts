import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Jarvis outreach autopilot: one bounded pass (opt-outs, emails for finished
 * demos, new demos) per call. Cron-secret authenticated; does nothing while
 * the switch on the Jarvis page is off.
 *
 * This endpoint has external side effects (it can send email), so it is POST-only.
 * GET requests must never trigger an outreach run through crawlers, previews, or
 * link scanners.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runOutreachAutopilot } = await import("@/lib/prospect-outreach.server");
  try {
    const base = (process.env["APP_URL"] ?? new URL(request.url).origin).replace(/\/$/, "");
    return Response.json(await runOutreachAutopilot(supabaseAdmin as never, base), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[prospect-outreach job]", error);
    return Response.json(
      { error: "prospect-outreach failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const Route = createFileRoute("/api/public/jobs/prospect-outreach")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
