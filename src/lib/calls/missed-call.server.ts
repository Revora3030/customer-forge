/**
 * Server side of the Twilio Voice missed-call alert. Every request is verified
 * with the X-Twilio-Signature HMAC (TWILIO_AUTH_TOKEN) before anything is read
 * or written; unsigned or invalid requests get 403, and a missing token 503.
 * The organization id travels in the signed webhook URL, so it cannot be
 * swapped without the auth token. Voice only: no SMS is ever sent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { alertRecipient } from "@/lib/lead-alert-recipient";
import {
  CALL_STATUS_PATH,
  MISSED_CALL_SOURCE,
  TWIML_HEADERS,
  VOICE_PATH,
  callSidMarker,
  callStatusUrl,
  dialTwiml,
  displayPhone,
  hangupTwiml,
  isCallSid,
  isMissedDialStatus,
  missedCallTwiml,
  orgIdFromUrl,
  toE164,
} from "./missed-call";

type DeliveryResult = { ok: true; skipped?: boolean } | { ok: false; retry: boolean; reason: string };

export type MissedCallDeps = {
  db: SupabaseClient;
  sendLeadAlert: (to: string, data: Record<string, unknown>, key: string) => Promise<DeliveryResult>;
  logAlertDelivery: (entry: { organizationId: string; leadId: string | null; recipient: string; kind: string; result: DeliveryResult }) => Promise<void>;
};

/** Parses the form body and checks Twilio's signature against the URLs Twilio may have signed. */
export async function verifiedTwilioParams(
  request: Request,
  path: string,
  authToken: string,
): Promise<Record<string, string> | null> {
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return null;
  const { validateTwilioSignature } = await import("@/lib/sms/twilio.server");
  // Behind a proxy request.url can differ from the URL Twilio signed, so the
  // configured public URL (same path and query) is accepted too.
  const appUrl = process.env["APP_URL"]?.trim().replace(/\/$/, "");
  const search = new URL(request.url).search;
  const candidates = [request.url, appUrl ? `${appUrl}${path}${search}` : null].filter((u): u is string => Boolean(u));
  for (const url of candidates) {
    if (await validateTwilioSignature(authToken, url, params, signature)) return params;
  }
  return null;
}

type Org = { id: string; name: string; forwardTo: string | null; profile: Record<string, unknown> };

async function loadOrg(db: SupabaseClient, orgId: string): Promise<Org | null> {
  const [{ data: org, error }, { data: profile }] = await Promise.all([
    db.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    db
      .from("business_profiles")
      .select("email, owner_email, notification_email, notify_on_lead, phone")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`organization lookup failed: ${error.message}`);
  if (!org) return null;
  const p = (profile ?? {}) as Record<string, unknown>;
  return { id: String(org.id), name: String(org.name ?? ""), forwardTo: toE164(typeof p["phone"] === "string" ? p["phone"] : null), profile: p };
}

/**
 * Records one missed call: a `missed_call` lead (once per CallSid) and an owner
 * alert email whose Phone row and "Call back" button are tel: links.
 */
export async function recordMissedCall(
  deps: MissedCallDeps,
  org: Org,
  call: { callSid: string; from: string | null; status: string },
): Promise<{ leadId: string; created: boolean; alert: DeliveryResult | null }> {
  const marker = callSidMarker(call.callSid);
  const existing = await deps.db
    .from("leads")
    .select("id")
    .eq("organization_id", org.id)
    .eq("source", MISSED_CALL_SOURCE)
    .eq("notes", marker)
    .maybeSingle();
  if (existing.error) throw new Error(`lead lookup failed: ${existing.error.message}`);
  if (existing.data?.id) return { leadId: String(existing.data.id), created: false, alert: null };

  const caller = toE164(call.from);
  const label = caller ? displayPhone(caller) : "a blocked number";
  const inserted = await deps.db
    .from("leads")
    .insert({
      organization_id: org.id,
      name: `Missed call from ${label}`,
      phone: caller,
      source: MISSED_CALL_SOURCE,
      message: caller
        ? `Missed call (${call.status}). Call back: ${caller}`
        : `Missed call (${call.status}) from a blocked number.`,
      notes: marker,
    } as never)
    .select("id")
    .single();
  if (inserted.error || !inserted.data) throw new Error(`lead insert failed: ${inserted.error?.message ?? "no row"}`);
  const leadId = String((inserted.data as { id: string }).id);

  const to = alertRecipient(org.profile as never);
  if (!to) return { leadId, created: true, alert: null };
  const alert = await deps.sendLeadAlert(
    to,
    {
      businessName: org.name,
      kind: "Missed call",
      leadName: label,
      ...(caller ? { leadPhone: caller, callbackPhone: caller } : {}),
      message: caller ? "Nobody picked up. Tap Call back to return the call." : "The caller hid their number, so there is no callback number.",
    },
    // Same key format as form leads: one alert per lead, and the email links to it.
    `lead-alert-${leadId}`,
  );
  await deps.logAlertDelivery({ organizationId: org.id, leadId, recipient: to, kind: "missed_call", result: alert });
  return { leadId, created: true, alert };
}

const xml = (body: string, status = 200) => new Response(body, { status, headers: TWIML_HEADERS });

async function defaultDeps(): Promise<MissedCallDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendLeadAlert } = await import("@/lib/messaging.server");
  const { logAlertDelivery } = await import("@/lib/notifications.server");
  return {
    db: supabaseAdmin as unknown as SupabaseClient,
    sendLeadAlert: (to, data, key) => sendLeadAlert(to, data, key),
    logAlertDelivery: (entry) => logAlertDelivery(null, entry),
  };
}

type Kind = "voice" | "status";

/** Shared webhook handler for both Twilio Voice routes. */
export async function handleTwilioVoiceWebhook(
  request: Request,
  kind: Kind,
  depsFactory: () => Promise<MissedCallDeps> = defaultDeps,
): Promise<Response> {
  const authToken = process.env["TWILIO_AUTH_TOKEN"]?.trim();
  if (!authToken) {
    // Unverifiable: nothing is read or trusted. Warn (secret name only) so the gap is visible in logs.
    console.warn(`[twilio ${kind}] TWILIO_AUTH_TOKEN is not configured; webhook not processed (503)`);
    return new Response("Not configured", { status: 503 });
  }
  const params = await verifiedTwilioParams(request, kind === "voice" ? VOICE_PATH : CALL_STATUS_PATH, authToken);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const orgId = orgIdFromUrl(request.url);
  const callSid = params["CallSid"] ?? "";
  if (!orgId || !isCallSid(callSid)) return new Response("Bad request", { status: 400 });

  const deps = await depsFactory();
  let org: Org | null;
  try {
    org = await loadOrg(deps.db, orgId);
  } catch (error) {
    console.error("[twilio voice]", error instanceof Error ? error.message : error);
    return xml(missedCallTwiml(null));
  }
  if (!org) return new Response("Unknown organization", { status: 404 });

  const caller = params["From"] ?? null;
  if (kind === "voice") {
    // Ring the owner unless there is no number to ring, or it is the number being called (a loop).
    const calledNumber = toE164(params["To"]);
    if (org.forwardTo && org.forwardTo !== calledNumber) return xml(dialTwiml(org.forwardTo, callStatusUrl(org.id)));
    await recordMissedCall(deps, org, { callSid, from: caller, status: "no-forwarding-number" }).catch((error: unknown) =>
      console.error("[twilio voice] missed call not recorded", error instanceof Error ? error.message : error),
    );
    return xml(missedCallTwiml(org.name));
  }

  const status = (params["DialCallStatus"] ?? "").trim().toLowerCase();
  if (!isMissedDialStatus(status)) return xml(hangupTwiml());
  try {
    // The parent call's SID: one lead per inbound call, however often Twilio retries.
    await recordMissedCall(deps, org, { callSid, from: caller, status });
  } catch (error) {
    // The caller still hears a polite message; the failure is logged for follow-up.
    console.error("[twilio call-status] missed call not recorded", error instanceof Error ? error.message : error);
  }
  return xml(missedCallTwiml(org.name));
}
