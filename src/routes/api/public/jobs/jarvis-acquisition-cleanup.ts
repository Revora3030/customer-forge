import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runAcquisitionSourceDataCleanup } = await import("@/lib/jarvis-acquisition-studio.functions");
  try {
    const db = supabaseAdmin as unknown as SupabaseClient;
    return Response.json(await runAcquisitionSourceDataCleanup(db, apply));
  } catch (error) {
    console.error("[jarvis acquisition cleanup]", error);
    return Response.json({ error: "Jarvis acquisition cleanup failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/jarvis-acquisition-cleanup")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
