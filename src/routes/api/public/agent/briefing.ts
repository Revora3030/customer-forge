import { createFileRoute } from "@tanstack/react-router";

/**
 * The 8 AM briefing as plain sentences the bot can speak, plus the numbers it
 * came from. The bot adds open pull requests from its own GitHub access.
 * Key-protected. Level 1.
 */
export const Route = createFileRoute("/api/public/agent/briefing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { denyUnlessAgent, agentHealth, agentAnalytics, briefingText } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const [health, analytics] = await Promise.all([
            agentHealth(supabaseAdmin as never),
            agentAnalytics(1).catch(() => null),
          ]);
          return Response.json({ text: briefingText({ health, analytics }), health, analytics });
        } catch (error) {
          console.error("[agent briefing]", error);
          return Response.json({ error: "briefing could not be prepared" }, { status: 500 });
        }
      },
    },
  },
});
