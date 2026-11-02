/**
 * Background worker for builder chat plans and applies. Called by the
 * database (pg_net via call_revora_job) with the scheduler secret, so the work
 * is held open by the database instead of the owner's phone. Streams
 * keep-alive bytes so the hosting proxy never closes a long AI step.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/jobs/builder-chat")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const jobId = new URL(request.url).searchParams.get("job") ?? "";
        if (!UUID.test(jobId)) return Response.json({ error: "Invalid job" }, { status: 400 });
        const { runChatJobInBackground } = await import("@/lib/builder/chat-jobs.server");
        const { executeBuilderChatJob } = await import("@/lib/site-agent.functions");
        const { keepAliveJsonResponse } = await import("@/lib/builder/keep-alive-response");
        return keepAliveJsonResponse(runChatJobInBackground(jobId, executeBuilderChatJob as never), (error) => {
          console.error("[builder-chat worker]", error);
          return { error: "Worker run failed" };
        });
      },
    },
  },
});
