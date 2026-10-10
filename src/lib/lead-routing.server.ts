/**
 * Server-only outbound lead routing.
 *
 * Webhook endpoints are tenant configuration, not application secrets. The URL
 * is validated at the server boundary and is never returned to the public-site
 * payload. Delivery is best effort: a webhook outage must never turn a
 * successfully persisted lead into a failed visitor submission.
 */
import { guardedFetch, isFetchableHostname, UnsafeOutboundUrlError } from "@/lib/net-guard.server";

export type LeadWebhookPayload = {
  event: "lead.created";
  timestamp: string;
  /** Kept for existing receivers; same value as organization_id. */
  workspace_id: string;
  /** Standard tenant identifier many CRM/webhook receivers validate. */
  organization_id: string;
  /** Stable per lead: a retried submit or redelivery carries the same key. */
  idempotency_key: string;
  lead: {
    lead_id: string;
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
  kind: "timeout" | "network" | "http" | "configuration";
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

/** One key per lead, so every delivery attempt for it is the same event. */
export function leadIdempotencyKey(leadId: string): string {
  return `lead.created:${leadId}`;
}

/**
 * Builds the outbound body. Required fields are always present (null when
 * unknown) so strict receivers validating `lead_id`, `name`, `email`, `phone`
 * and `organization_id` never answer 400 for a missing key.
 */
export function buildLeadWebhookPayload(input: {
  organizationId: string;
  leadId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  service?: string | null;
  message?: string | null;
  sourceUrl: string;
  now?: Date;
}): LeadWebhookPayload {
  return {
    event: "lead.created",
    timestamp: (input.now ?? new Date()).toISOString(),
    workspace_id: input.organizationId,
    organization_id: input.organizationId,
    idempotency_key: leadIdempotencyKey(input.leadId),
    lead: {
      lead_id: input.leadId,
      name: String(input.name ?? "").trim().slice(0, 200),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      service: input.service?.trim() || null,
      message: input.message?.trim() || null,
      source_url: input.sourceUrl,
    },
  };
}

export function classifyLeadWebhookFailure(
  statusCode: number | null,
  kind: LeadWebhookFailure["kind"],
): LeadWebhookFailure {
  if (kind === "timeout") return { statusCode, retryable: true, kind };
  if (kind === "network") return { statusCode, retryable: true, kind };
  if (kind === "configuration") return { statusCode, retryable: false, kind };
  return {
    statusCode,
    retryable: statusCode === null || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500,
    kind,
  };
}

export function validateLeadWebhookUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    // Leads contain personal contact data: never send it over plaintext HTTP,
    // embedded credentials, arbitrary ports, or literal/private addresses.
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    if (!isFetchableHostname(url.hostname)) return null;
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
  if (!webhookUrl?.trim()) return { ok: true, skipped: true, reason: "not_configured", attemptedAt };
  const url = validateLeadWebhookUrl(webhookUrl);
  if (!url) return {
    ok: false, skipped: false, reason: "invalid_webhook_url", attemptedAt,
    statusCode: null, retryable: false, kind: "configuration",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await guardedFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revora-event": payload.event,
        "x-revora-workspace-id": payload.workspace_id,
        // Receivers that dedupe on the header (Stripe-style) see the same key
        // the body carries, so a redelivered lead is never created twice.
        "idempotency-key": payload.idempotency_key,
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
    const timeout = controller.signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
    const unsafe = error instanceof UnsafeOutboundUrlError;
    // Never store/log a raw network error, which can contain the secret webhook URL.
    const reason = unsafe ? "unsafe_webhook_target" : timeout ? "timeout" : "webhook_transport_error";
    const failure = classifyLeadWebhookFailure(null, unsafe ? "configuration" : timeout ? "timeout" : "network");
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
