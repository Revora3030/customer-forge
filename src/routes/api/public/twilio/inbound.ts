import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Twilio inbound SMS webhook. Verified with X-Twilio-Signature (HMAC of the
 * public URL and POST params with TWILIO_AUTH_TOKEN) before anything is read.
 * STOP-style replies add the number to do-not-contact; START/YES record SMS
 * consent and lift a STOP. Replies with empty TwiML (Twilio sends its own
 * opt-out confirmation).
 */
async function handle(request: Request): Promise<Response> {
  const authToken = process.env["TWILIO_AUTH_TOKEN"]?.trim();
  if (!authToken) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;

  const { validateTwilioSignature } = await import("@/lib/sms/twilio.server");
  const signature = request.headers.get("x-twilio-signature");
  // Behind a proxy request.url can differ from the URL Twilio signed, so the
  // configured public URL is accepted too.
  const appUrl = process.env["APP_URL"]?.trim().replace(/\/$/, "");
  const candidates = [request.url, appUrl ? `${appUrl}/api/public/twilio/inbound` : null].filter((url): url is string => Boolean(url));
  let valid = false;
  for (const url of candidates) {
    if (await validateTwilioSignature(authToken, url, params, signature)) valid = true;
  }
  if (!valid) return new Response("Invalid signature", { status: 403 });

  const { handleInboundSms } = await import("@/lib/prospect-outreach.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await handleInboundSms(supabaseAdmin as never, params["From"] ?? "", params["Body"] ?? "");
  } catch (error) {
    console.error("[twilio inbound]", error instanceof Error ? error.message : error);
    // A failed opt-out must be retried by Twilio rather than silently lost.
    return new Response("Temporary failure", { status: 500 });
  }
  return new Response(EMPTY_TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export const Route = createFileRoute("/api/public/twilio/inbound")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => handle(request),
    },
  },
});
