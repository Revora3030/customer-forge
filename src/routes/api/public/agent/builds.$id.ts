import { createFileRoute } from "@tanstack/react-router";

/** One build's live progress, stage and checkpoints. Key-protected. Level 1. */
export const Route = createFileRoute("/api/public/agent/builds/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { denyUnlessAgent, agentBuild } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const build = await agentBuild(supabaseAdmin as never, params.id);
          return build ? Response.json(build) : Response.json({ error: "Build not found" }, { status: 404 });
        } catch (error) {
          console.error("[agent build]", error);
          return Response.json({ error: "build could not be read" }, { status: 500 });
        }
      },
    },
  },
});
