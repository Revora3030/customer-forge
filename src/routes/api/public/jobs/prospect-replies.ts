import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduler endpoint for prospect replies (pg_cron, every 10 minutes).
 * Bearer-authenticated like the other jobs. POST-only because a run sends
 * queued outreach and in-thread replies. Drains the send queue, then polls
 * the Gmail threads of sent outreach; without the GMAIL_* secrets it returns
 * status "gmail_not_configured" after draining.
 */
function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonNoStore(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return noStore(denied as Response);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runProspectReplies } = await import("@/lib/prospect-replies.server");
  try {
    return jsonNoStore(await runProspectReplies(supabaseAdmin as never));
  } catch (error) {
    console.error("[prospect replies]", error);
    return jsonNoStore({ error: "Prospect replies run failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/prospect-replies")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
});
