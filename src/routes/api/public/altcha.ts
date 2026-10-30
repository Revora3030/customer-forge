import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Signed ALTCHA proof-of-work challenge for the public lead, booking, quote and
 * contact forms. Anonymous, no cookies, never cached. 204 when the server has no
 * signing key (the widget then simply has nothing to solve and the form still
 * submits, protected by the rate limits). Rules: src/lib/altcha.server.ts.
 */
async function handle(): Promise<Response> {
  const { createAltchaChallenge } = await import("@/lib/altcha.server");
  const challenge = await createAltchaChallenge().catch(() => null);
  if (!challenge) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  return new Response(JSON.stringify(challenge), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/altcha")({
  server: {
    handlers: {
      GET: () => handle(),
      POST: () => methodNotAllowed(["GET"]),
    },
  },
});
