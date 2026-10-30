import { createFileRoute } from "@tanstack/react-router";

/** Recent builds (progress and stage only) for the owner's outside bot. Key-protected. Level 1. */
export const Route = createFileRoute("/api/public/agent/builds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { denyUnlessAgent, agentBuilds } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const builds = await agentBuilds(supabaseAdmin as never, {
            status: url.searchParams.get("status"),
            limit: Number(url.searchParams.get("limit") ?? 20) || 20,
          });
          return Response.json({ builds });
        } catch (error) {
          console.error("[agent builds]", error);
          return Response.json({ error: "builds could not be read" }, { status: 500 });
        }
      },
    },
  },
});
