import { createFileRoute } from "@tanstack/react-router";

/** Platform counts for the owner's outside bot (Grok). Key-protected; returns counts only. */
export const Route = createFileRoute("/api/public/agent/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { denyUnlessAgent, agentHealth } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          return Response.json(await agentHealth(supabaseAdmin as never));
        } catch (error) {
          console.error("[agent health]", error);
          return Response.json({ error: "health check failed" }, { status: 500 });
        }
      },
    },
  },
});
