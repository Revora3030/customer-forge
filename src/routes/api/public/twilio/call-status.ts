import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Twilio Voice dial result: a missed dial becomes a missed_call lead and an owner email.
 * Verified with X-Twilio-Signature (TWILIO_AUTH_TOKEN) before anything is read;
 * unsigned or invalid requests are rejected ("Invalid signature", 403). No SMS.
 */
export const Route = createFileRoute("/api/public/twilio/call-status")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const { handleTwilioVoiceWebhook } = await import("@/lib/calls/missed-call.server");
        return handleTwilioVoiceWebhook(request, "status");
      },
    },
  },
});
