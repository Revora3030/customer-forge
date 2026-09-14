/**
 * Optional n8n bridge.
 *
 * n8n is never the Revora system of record. This adapter only emits signed
 * event notifications when the owner has explicitly configured a self-hosted
 * n8n webhook. If it is not configured, Revora continues normally.
 */

export type RevoraAutomationEvent =
  | "lead.created"
  | "lead.status_changed"
  | "appointment.created"
  | "appointment.completed"
  | "review.request_due"
  | "website.audit.completed"
  | "customer.inactive";

export type RevoraAutomationPayload = {
  organizationId: string;
  event: RevoraAutomationEvent;
  occurredAt?: string;
  data: Record<string, unknown>;
};

function configured() {
  return Boolean(process.env["N8N_BASE_URL"] && process.env["N8N_WEBHOOK_SECRET"]);
}

function baseUrl() {
  return String(process.env["N8N_BASE_URL"] ?? "").replace(/\/$/, "");
}

/** Emits one event to the owner's n8n webhook. Missing n8n is intentionally a no-op. */
export async function emitN8nEvent(payload: RevoraAutomationPayload): Promise<boolean> {
  if (!configured()) return false;

  const secret = process.env["N8N_WEBHOOK_SECRET"]!;
  const body = JSON.stringify({
    source: "revora",
    version: 1,
    ...payload,
    occurredAt: payload.occurredAt ?? new Date().toISOString(),
  });

  try {
    const response = await fetch(`${baseUrl()}/webhook/revora`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revora-webhook-secret": secret,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`[n8n] webhook returned ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[n8n] webhook delivery deferred", error);
    return false;
  }
}
