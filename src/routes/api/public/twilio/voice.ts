import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Twilio Voice webhook for a business number: rings the owner with <Dial>.
 * Verified with X-Twilio-Signature (TWILIO_AUTH_TOKEN) before anything is read;
 * unsigned or invalid requests are rejected ("Invalid signature", 403). No SMS.
 */
export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const { handleTwilioVoiceWebhook } = await import("@/lib/calls/missed-call.server");
        return handleTwilioVoiceWebhook(request, "voice");
      },
    },
  },
});
