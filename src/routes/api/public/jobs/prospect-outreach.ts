import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Jarvis outreach autopilot: one bounded pass (opt-outs, emails for finished
 * demos, new demos) per call. Cron-secret authenticated; does nothing while
 * the switch on the Jarvis page is off.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runOutreachAutopilot } = await import("@/lib/prospect-outreach.server");
  try {
    const base = (process.env["APP_URL"] ?? new URL(request.url).origin).replace(/\/$/, "");
    return Response.json(await runOutreachAutopilot(supabaseAdmin as never, base));
  } catch (error) {
    console.error("[prospect-outreach job]", error);
    return Response.json({ error: "prospect-outreach failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/prospect-outreach")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
