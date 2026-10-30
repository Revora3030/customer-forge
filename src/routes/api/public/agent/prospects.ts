import { createFileRoute } from "@tanstack/react-router";

/**
 * The owner's outside bot (Grok) sends leads here. They land in the same review
 * list as a CSV import (Jarvis page) and wait for the owner's approval. Nothing
 * is emailed and no site is built by this call.
 */
export const Route = createFileRoute("/api/public/agent/prospects")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { denyUnlessAgent, ownerActorId } = await import("@/lib/agent-gateway.server");
        const denied = denyUnlessAgent(request);
        if (denied) return denied;

        const { agentProspectBatchSchema, prospectsToCsv } = await import("@/lib/agent-gateway");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON." }, { status: 400 });
        }
        const parsed = agentProspectBatchSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid prospects", issues: parsed.error.issues.slice(0, 20) }, { status: 422 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const actorId = await ownerActorId(supabaseAdmin as never);
          if (!actorId) return Response.json({ error: "No owner account found." }, { status: 503 });
          const { importLeadCsv } = await import("@/lib/prospect-lead-import.server");
          const summary = await importLeadCsv(supabaseAdmin as never, { csv: prospectsToCsv(parsed.data.prospects), actorId });
          return Response.json({ status: "pending_owner_review", ...summary });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Import failed.";
          console.error("[agent prospects]", message);
          return Response.json({ error: message }, { status: 409 });
        }
      },
    },
  },
});
