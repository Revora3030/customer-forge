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

export type LeadWebhookFailure = {
  statusCode: number | null;
  retryable: boolean;
  kind: "timeout" | "network" | "http";
};

export type LeadWebhookResult =
  | { ok: true; skipped?: false; attemptedAt: string }
  | { ok: true; skipped: true; reason: "not_configured"; attemptedAt: string }
  | {
      ok: false;
      skipped: false;
      reason: string;
      attemptedAt: string;
      statusCode: number | null;
      retryable: boolean;
      kind: LeadWebhookFailure["kind"];
    };

const WEBHOOK_TIMEOUT_MS = 5_000;

export function classifyLeadWebhookFailure(
  statusCode: number | null,
  kind: LeadWebhookFailure["kind"],
): LeadWebhookFailure {
  if (kind === "timeout") return { statusCode, retryable: true, kind };
  if (kind === "network") return { statusCode, retryable: true, kind };
  return {
    statusCode,
    retryable: statusCode === null || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500,
    kind,
  };
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[0-1])\./.test(host)
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
  const attemptedAt = new Date().toISOString();
  const url = validateLeadWebhookUrl(webhookUrl);
  if (!url) return { ok: true, skipped: true, reason: "not_configured", attemptedAt };

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
      const failure = classifyLeadWebhookFailure(response.status, "http");
      return {
        ok: false,
        skipped: false,
        reason: "http_" + response.status,
        attemptedAt,
        statusCode: failure.statusCode,
        retryable: failure.retryable,
        kind: failure.kind,
      };
    }

    return { ok: true, attemptedAt };
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    const reason = timeout
      ? "timeout"
      : error instanceof Error
        ? error.message.slice(0, 160)
        : "webhook_transport_error";
    const failure = classifyLeadWebhookFailure(null, timeout ? "timeout" : "network");
    console.warn("[lead-routing] webhook delivery failed", {
      reason,
      attemptedAt,
      retryable: failure.retryable,
      kind: failure.kind,
    });
    return {
      ok: false,
      skipped: false,
      reason,
      attemptedAt,
      statusCode: null,
      retryable: failure.retryable,
      kind: failure.kind,
    };
  } finally {
    clearTimeout(timer);
  }
}
