import { createFileRoute } from "@tanstack/react-router";

/** The bot reports the result of an approved action (approved -> completed/failed). Key-protected. */
export const Route = createFileRoute("/api/public/agent/action-requests/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { denyUnlessAgent } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { actionCompletionSchema } = await import("@/lib/agent-gateway");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON." }, { status: 400 });
        }
        const parsed = actionCompletionSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid result", issues: parsed.error.issues.slice(0, 20) }, { status: 422 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { completeActionRequest, botView, ActionRequestError } = await import("@/lib/agent-action-requests.server");
        try {
          const done = await completeActionRequest(supabaseAdmin as never, {
            id: params.id,
            ok: parsed.data.ok,
            resultUrl: parsed.data.result_url,
            note: parsed.data.note,
          });
          return Response.json(botView(done, new URL(request.url).origin));
        } catch (error) {
          if (error instanceof ActionRequestError) return Response.json({ error: error.message }, { status: error.status });
          return Response.json({ error: "result could not be saved" }, { status: 500 });
        }
      },
    },
  },
});
