import { createFileRoute } from "@tanstack/react-router";

/** The founder's decision on one request. Act only when `mayExecute` is true. Key-protected. Level 1. */
export const Route = createFileRoute("/api/public/agent/action-requests/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { denyUnlessAgent } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { readActionRequest, botView, ActionRequestError } = await import("@/lib/agent-action-requests.server");
        try {
          const found = await readActionRequest(supabaseAdmin as never, params.id);
          return found ? Response.json(botView(found, new URL(request.url).origin)) : Response.json({ error: "Request not found" }, { status: 404 });
        } catch (error) {
          if (error instanceof ActionRequestError) return Response.json({ error: error.message }, { status: error.status });
          return Response.json({ error: "request could not be read" }, { status: 500 });
        }
      },
    },
  },
});
