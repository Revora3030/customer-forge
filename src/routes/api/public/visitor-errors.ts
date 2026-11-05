import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Anonymous visitor-error beacon for published client sites (LOV-4). POST only.
 * Rules live in visitor-errors(.server).ts.
 */
async function handle(request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { handleVisitorErrorRequest } = await import("@/lib/visitor-errors.server");
  return handleVisitorErrorRequest(request, supabaseAdmin as never);
}

export const Route = createFileRoute("/api/public/visitor-errors")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: ({ request }) => handle(request),
    },
  },
});
