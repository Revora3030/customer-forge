/**
 * Self-QA runner endpoint (PAI-19). Cron-authenticated, like the other worker
 * routes. `?action=claim` hands the runner queued public pages to open;
 * `?action=report` receives screenshots and measurements for one claimed job.
 * Never returns owner data: a claim carries only the job id, page address and fence.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

const MAX_BODY_BYTES = 4_500_000;

export const Route = createFileRoute("/api/public/jobs/qa-jobs")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied as Response;
        const action = new URL(request.url).searchParams.get("action");
        if (action !== "claim" && action !== "report") return Response.json({ error: "Unknown action" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const qa = await import("@/lib/qa/qa-jobs.server");
        const repo = qa.supabaseQaRepo(supabaseAdmin);
        try {
          if (action === "claim") {
            const worker = (request.headers.get("x-qa-worker") ?? "runner").slice(0, 80);
            return Response.json({ jobs: await qa.claimQaJobs(repo, worker) });
          }
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Report too large" }, { status: 413 });
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            return Response.json({ error: "Body must be JSON" }, { status: 400 });
          }
          const report = qa.parseQaReport(body);
          if (typeof report === "string") return Response.json({ error: report }, { status: 400 });
          const outcome = await qa.recordQaReport(repo, qa.supabaseQaStorage(supabaseAdmin), report);
          return Response.json({ outcome }, { status: outcome === "unknown_job" ? 404 : outcome === "stale" ? 409 : 200 });
        } catch (error) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError(error, { route: "jobs/qa-jobs" });
          return Response.json({ error: "QA job request failed" }, { status: 500 });
        }
      },
    },
  },
});
