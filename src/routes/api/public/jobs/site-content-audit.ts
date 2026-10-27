import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Weekly content check of published customer sites (title, h1, structured data,
 * alt text, broken internal links). Reports to the Revora inbox only.
 * Bearer-authenticated with the cron secret and called by GitHub Actions
 * (.github/workflows/scheduled-jobs.yml). Safe to repeat: the digest claims a
 * unique log row per week.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSiteContentAudit } = await import("@/lib/site-content-audit.server");
  try {
    const run = await runSiteContentAudit(supabaseAdmin as never);
    // Per-site findings stay in the inbox digest; the job log gets counts only.
    const { audits: _audits, ...summary } = run;
    return Response.json(summary);
  } catch (error) {
    console.error("[site-content-audit job]", error);
    return Response.json({ error: "site-content-audit failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/site-content-audit")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
