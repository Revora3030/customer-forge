import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleTwilioVoiceWebhook, type MissedCallDeps } from "./missed-call.server";

const TOKEN = "test-auth-token";
const ORG = "3f2b6c1e-9a4d-4e8b-b1c2-0d9e8f7a6b5c";
const SID = `CA${"0123456789abcdef".repeat(2)}`;
const BASE = "https://app.example";

/** Twilio's documented scheme: HMAC-SHA1 over URL + sorted key/value pairs, base64. */
function sign(url: string, params: Record<string, string>, token = TOKEN) {
  const payload = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", token).update(payload).digest("base64"); // DevSkim: ignore DS126858 -- Twilio signs webhooks with HMAC-SHA1; test mirrors the provider algorithm.
}

function twilioRequest(path: string, params: Record<string, string>, opts: { signature?: string | null; signUrl?: string } = {}) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const signature = opts.signature === undefined ? sign(opts.signUrl ?? url, params) : opts.signature;
  if (signature) headers["x-twilio-signature"] = signature;
  return new Request(url, { method: "POST", headers, body: new URLSearchParams(params).toString() });
}

type Row = Record<string, unknown>;

/** Minimal Supabase stand-in covering the queries the handler makes. */
function fakeDeps(opts: { phone?: string | null; notify?: boolean; org?: boolean } = {}) {
  const leads: Row[] = [];
  const sent: Array<{ to: string; data: Record<string, unknown>; key: string }> = [];
  const logged: Row[] = [];
  const tables: Record<string, Row[]> = {
    organizations: opts.org === false ? [] : [{ id: ORG, name: "Acme Plumbing" }],
    business_profiles: [
      { organization_id: ORG, email: "owner@acme.test", notify_on_lead: opts.notify ?? true, phone: opts.phone === undefined ? "(919) 555-0100" : opts.phone },
    ],
    leads,
  };
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let insertRow: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k === "id" && table === "organizations" ? "id" : k, v]), q),
      insert: (row: Row) => ((insertRow = { id: `00000000-0000-4000-8000-00000000000${leads.length + 1}`, ...row }), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        if (insertRow) {
          tables[table]!.push(insertRow);
          return { data: insertRow, error: null };
        }
        return { data: rows()[0] ?? null, error: null };
      },
    };
    return q;
  };
  const deps: MissedCallDeps = {
    db: { from } as never,
    sendLeadAlert: async (to, data, key) => (sent.push({ to, data, key }), { ok: true }),
    logAlertDelivery: async (entry) => void logged.push(entry as never),
  };
  return { deps, leads, sent, logged, factory: async () => deps };
}

const VOICE = `/api/public/twilio/voice?org=${ORG}`;
const STATUS = `/api/public/twilio/call-status?org=${ORG}`;
const call = { CallSid: SID, From: "+19195550134", To: "+19195559999" };

beforeEach(() => {
  vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
  vi.stubEnv("APP_URL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Twilio Voice webhook signature checks", () => {
  it("is unavailable (503) without TWILIO_AUTH_TOKEN", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const f = fakeDeps();
    const res = await handleTwilioVoiceWebhook(twilioRequest(VOICE, call), "voice", f.factory);
    expect(res.status).toBe(503);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("TWILIO_AUTH_TOKEN is not configured"));
  });

  it("rejects unsigned requests", async () => {
    const f = fakeDeps();
    const res = await handleTwilioVoiceWebhook(twilioRequest(VOICE, call, { signature: null }), "voice", f.factory);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Invalid signature");
  });

  it("rejects a wrong signature, a wrong token, and a tampered org or body", async () => {
    const f = fakeDeps();
    const bad = [
      twilioRequest(VOICE, call, { signature: "bm90LXZhbGlk" }),
      twilioRequest(VOICE, call, { signature: sign(`${BASE}${VOICE}`, call, "other-token") }),
      twilioRequest(VOICE, call, { signUrl: `${BASE}/api/public/twilio/voice?org=00000000-0000-4000-8000-000000000000` }),
      twilioRequest(STATUS, { ...call, DialCallStatus: "no-answer" }, { signature: sign(`${BASE}${STATUS}`, { ...call, DialCallStatus: "completed" }) }),
    ];
    for (const req of bad) {
      const res = await handleTwilioVoiceWebhook(req, req.url.includes("voice") ? "voice" : "status", f.factory);
      expect(res.status).toBe(403);
    }
    expect(f.leads).toHaveLength(0);
    expect(f.sent).toHaveLength(0);
  });

  it("accepts the configured public URL when the proxy changed request.url", async () => {
    vi.stubEnv("APP_URL", "https://public.example/");
    const f = fakeDeps();
    const res = await handleTwilioVoiceWebhook(
      twilioRequest(VOICE, call, { signUrl: `https://public.example${VOICE}` }),
      "voice",
      f.factory,
    );
    expect(res.status).toBe(200);
  });
});

describe("Twilio Voice missed-call flow", () => {
  it("rings the owner's business phone with a dial that reports back", async () => {
    const f = fakeDeps();
    const res = await handleTwilioVoiceWebhook(twilioRequest(VOICE, call), "voice", f.factory);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    const xml = await res.text();
    expect(xml).toContain("<Number>+19195550100</Number>");
    expect(xml).toContain(`action="/api/public/twilio/call-status?org=${ORG}"`);
    expect(f.leads).toHaveLength(0);
  });

  it("turns an unanswered dial into one missed_call lead and one tel: callback alert", async () => {
    const f = fakeDeps();
    const params = { ...call, DialCallStatus: "no-answer" };
    const res = await handleTwilioVoiceWebhook(twilioRequest(STATUS, params), "status", f.factory);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sorry we missed your call");
    expect(f.leads).toEqual([
      expect.objectContaining({ organization_id: ORG, phone: "+19195550134", source: "missed_call", notes: `twilio_call_sid:${SID}` }),
    ]);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({
      to: "owner@acme.test",
      key: `lead-alert-${f.leads[0]!["id"]}`,
      data: { kind: "Missed call", callbackPhone: "+19195550134", leadPhone: "+19195550134" },
    });
    expect(f.logged).toEqual([expect.objectContaining({ organizationId: ORG, kind: "missed_call" })]);

    // Twilio retrying the same callback never duplicates the lead or the email.
    await handleTwilioVoiceWebhook(twilioRequest(STATUS, params), "status", f.factory);
    expect(f.leads).toHaveLength(1);
    expect(f.sent).toHaveLength(1);
  });

  it("does nothing when the owner answered", async () => {
    const f = fakeDeps();
    const res = await handleTwilioVoiceWebhook(twilioRequest(STATUS, { ...call, DialCallStatus: "completed" }), "status", f.factory);
    expect(await res.text()).toContain("<Hangup/>");
    expect(f.leads).toHaveLength(0);
    expect(f.sent).toHaveLength(0);
  });

  it("records a missed call straight away when there is no owner number, or it would loop", async () => {
    for (const phone of [null, "+19195559999"]) {
      const f = fakeDeps({ phone });
      const res = await handleTwilioVoiceWebhook(twilioRequest(VOICE, call), "voice", f.factory);
      const xml = await res.text();
      expect(xml).not.toContain("<Dial");
      expect(f.leads).toHaveLength(1);
      expect(f.sent).toHaveLength(1);
    }
  });

  it("keeps blocked callers as leads without a callback button, and respects alerts being off", async () => {
    const f = fakeDeps();
    await handleTwilioVoiceWebhook(twilioRequest(STATUS, { ...call, From: "Anonymous", DialCallStatus: "busy" }), "status", f.factory);
    expect(f.leads[0]).toMatchObject({ phone: null });
    expect(f.sent[0]!.data).not.toHaveProperty("callbackPhone");

    const off = fakeDeps({ notify: false });
    await handleTwilioVoiceWebhook(twilioRequest(STATUS, { ...call, DialCallStatus: "no-answer" }), "status", off.factory);
    expect(off.leads).toHaveLength(1);
    expect(off.sent).toHaveLength(0);
  });

  it("rejects requests without an org, a call SID, or a known organization", async () => {
    const noOrg = "/api/public/twilio/voice";
    expect((await handleTwilioVoiceWebhook(twilioRequest(noOrg, call), "voice", fakeDeps().factory)).status).toBe(400);
    expect((await handleTwilioVoiceWebhook(twilioRequest(VOICE, { ...call, CallSid: "x" }), "voice", fakeDeps().factory)).status).toBe(400);
    expect((await handleTwilioVoiceWebhook(twilioRequest(VOICE, call), "voice", fakeDeps({ org: false }).factory)).status).toBe(404);
  });
});
