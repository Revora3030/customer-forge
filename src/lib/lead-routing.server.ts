/**
 * Server-only outbound lead routing.
 *
 * Webhook endpoints are tenant configuration, not application secrets. The URL
 * is validated at the server boundary and is never returned to the public-site
 * payload. Delivery is best effort: a webhook outage must never turn a
 * successfully persisted lead into a failed visitor submission.
 */

export type LeadWebhookPayload = {
  event: "lead.created";
  timestamp: string;
  workspace_id: string;
  lead: {
    name: string;
    email: string | null;
    phone: string | null;
    service: string | null;
    message: string | null;
    source_url: string;
  };
};

export type LeadWebhookResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: "not_configured" }
  | { ok: false; skipped: false; reason: string };

const WEBHOOK_TIMEOUT_MS = 5_000;

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
  return (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    /^127\\./.test(host) ||
    /^10\\./.test(host) ||
    /^192\\.168\\./.test(host) ||
    /^169\\.254\\./.test(host) ||
    /^172\\.(?:1[6-9]|2\\d|3[0-1])\\./.test(host)
  );
}

export function validateLeadWebhookUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || isPrivateHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function dispatchLeadWebhook(
  webhookUrl: string | null | undefined,
  payload: LeadWebhookPayload,
): Promise<LeadWebhookResult> {
  const url = validateLeadWebhookUrl(webhookUrl);
  if (!url) return { ok: true, skipped: true, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revora-event": payload.event,
        "x-revora-workspace-id": payload.workspace_id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: "http_" + response.status,
      };
    }

    return { ok: true };
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message.slice(0, 160)
          : "webhook_transport_error";
    console.warn("[lead-routing] webhook delivery failed", { reason });
    return { ok: false, skipped: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
