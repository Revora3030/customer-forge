import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Anonymous engagement beacon for prospect demo previews (/p/<token>).
 *
 * POST only, no auth: the token is the scope. The body is a small JSON object
 * ({token, event, page, ms, sid}) sent with navigator.sendBeacon. Unknown,
 * expired or non-prospect tokens get the same 204 as a recorded event, so the
 * endpoint can't be used to test tokens. Rate-limited per token + IP hash. No
 * cookies are read or set. The rules live in preview-telemetry(.server).ts.
 */
async function handle(request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { handlePreviewBeaconRequest } = await import("@/lib/preview-telemetry.server");
  return handlePreviewBeaconRequest(request, supabaseAdmin as never);
}

export const Route = createFileRoute("/api/public/preview-beacon")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: ({ request }) => handle(request),
    },
  },
});
