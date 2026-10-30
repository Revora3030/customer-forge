import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * A bot asks the founder to approve one Level 4 action (merge, deploy,
 * publish, send, paid build, billing, delete). The request waits on
 * /admin/approvals; nothing is carried out by this call. Key-protected.
 */
export const Route = createFileRoute("/api/public/agent/action-requests")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const { denyUnlessAgent } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { actionRequestSchema } = await import("@/lib/agent-gateway");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON." }, { status: 400 });
        }
        const parsed = actionRequestSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid action request", issues: parsed.error.issues.slice(0, 20) }, { status: 422 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createActionRequest, botView, ActionRequestError } = await import("@/lib/agent-action-requests.server");
        try {
          const { created, request: saved } = await createActionRequest(supabaseAdmin as never, parsed.data);
          return Response.json({ created, ...botView(saved, new URL(request.url).origin) }, { status: created ? 201 : 200 });
        } catch (error) {
          if (error instanceof ActionRequestError) return Response.json({ error: error.message }, { status: error.status });
          console.error("[agent action request]", error);
          return Response.json({ error: "request could not be saved" }, { status: 500 });
        }
      },
    },
  },
});
