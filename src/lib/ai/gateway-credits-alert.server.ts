/**
 * The AI gateway said the workspace is out of credits or at its spending cap
 * (HTTP 402, or an "insufficient credits" body): email the super-admin once.
 *
 * Uses the existing founder-alert path (email only, no SMS), so dedupe and the
 * hourly send cap come for free: the marker below is one per six-hour window,
 * kept in audit_logs, so every worker agrees. An in-process memo avoids even
 * the lookup for repeats. Fire-and-forget: an alert failure never touches the
 * AI call that was refused. Our own daily paid cap has its own alert in
 * paid-budget.server.ts and never reaches this code.
 */
import type { RevoraAiError } from "@/lib/ai/errors";

const WINDOW_MS = 6 * 3_600_000;

let lastMarker: string | null = null;

/** A refusal that comes from the gateway account itself, not from this app's own limits. */
export function isGatewayCreditsStop(error: Pick<RevoraAiError, "status" | "category" | "provider" | "detail">): boolean {
  if (error.provider && error.provider !== "lovable") return false;
  if (error.status === 402) return true;
  return error.category === "quota" && /insufficient[_ ]?(quota|credits?)|out of credits?|spending (cap|limit)|credit balance|not enough credits?/i.test(error.detail ?? "");
}

/** One marker per UTC six-hour window. */
export function gatewayCreditsMarker(now: number = Date.now()): string {
  const bucket = Math.floor(now / WINDOW_MS);
  const start = new Date(bucket * WINDOW_MS).toISOString().slice(0, 13);
  return `ai-gateway-credits:${start}`;
}

/** Test hook: forget the in-process memo. */
export function resetGatewayCreditsAlertForTests() {
  lastMarker = null;
}

/**
 * Called from the router when a gateway call fails. Does nothing unless the
 * failure is a credits / spending-cap stop; never throws, never waits.
 */
export function noteGatewayCreditsStop(error: Pick<RevoraAiError, "status" | "category" | "provider" | "detail">, now: number = Date.now()): void {
  if (!isGatewayCreditsStop(error)) return;
  const marker = gatewayCreditsMarker(now);
  if (lastMarker === marker) return;
  lastMarker = marker;
  void (async () => {
    try {
      const mod = await import("@/integrations/supabase/client.server");
      const { sendFounderAlert } = await import("@/lib/founder-alerts.server");
      const outcome = await sendFounderAlert(mod.supabaseAdmin as never, {
        kind: "ai_gateway_credits",
        marker,
        organizationId: null,
        title: "The AI gateway is out of credits or at its spending cap",
        summary:
          "The Lovable AI gateway refused a request with a credits / spending-cap error (HTTP 402). Builds and AI replies that need it wait or fall back until credits are added. Failed attempts are not retried in a loop.",
        rows: [
          ["Status", String(error.status)],
          ["Window (UTC)", marker.slice("ai-gateway-credits:".length)],
        ],
        link: "https://revoragrowthsystems.com/admin/ai",
      });
      // A failed send must be retried by the next refusal, not suppressed.
      if (outcome === "failed") lastMarker = null;
    } catch {
      lastMarker = null;
    }
  })();
}
