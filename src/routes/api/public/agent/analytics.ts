import { createFileRoute } from "@tanstack/react-router";

/** Sessions, conversion funnel, customers and MRR. Counts only. Key-protected. Level 1. */
export const Route = createFileRoute("/api/public/agent/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { denyUnlessAgent, agentAnalytics } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;
        const raw = Number(new URL(request.url).searchParams.get("days") ?? 30);
        const days = Math.min(365, Math.max(1, Math.round(Number.isFinite(raw) ? raw : 30)));
        try {
          return Response.json(await agentAnalytics(days));
        } catch (error) {
          console.error("[agent analytics]", error);
          return Response.json({ error: "analytics could not be read" }, { status: 500 });
        }
      },
    },
  },
});
