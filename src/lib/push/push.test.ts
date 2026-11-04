import { describe, expect, it, vi } from "vitest";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { applicationServerKey, leadPushPayload, parseSubscription } from "./push-config";
import { readVapidConfig } from "./vapid.server";
import { sendLeadPush, type PushDb } from "./lead-push.server";

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

async function vapidPair() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { publicKey: b64url(raw), privateKey: jwk.d! };
}

async function browserSubscription() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
  };
}

function fakeDb(
  rows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  error?: string,
) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const db: PushDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            limit: async () =>
              error ? { data: null, error: { message: error } } : { data: rows, error: null },
          }),
        }),
      }),
      update: (values) => ({
        eq: async (_column, id) => {
          updates.push({ id, values });
          return { error: null };
        },
      }),
    }),
  };
  return { db, updates };
}

describe("VAPID config", () => {
  it("is null unless all three env vars are valid", async () => {
    const { publicKey, privateKey } = await vapidPair();
    expect(readVapidConfig({})).toBeNull();
    expect(
      readVapidConfig({
        VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: "not-a-key",
        VAPID_SUBJECT: "mailto:a@b.co",
      }),
    ).toBeNull();
    expect(
      readVapidConfig({
        VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: privateKey,
        VAPID_SUBJECT: "not-a-subject",
      }),
    ).toBeNull();
    const config = readVapidConfig({
      VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey,
      VAPID_SUBJECT: "mailto:ops@revoragrowthsystems.com",
    });
    expect(config?.publicKey).toBe(publicKey);
    expect(applicationServerKey(publicKey)).toHaveLength(65);
  });
});

describe("parseSubscription", () => {
  it("accepts a real browser subscription and rejects unsafe endpoints", async () => {
    const sub = await browserSubscription();
    expect(parseSubscription(sub)).toEqual({ endpoint: sub.endpoint, ...sub.keys });
    expect(parseSubscription({ ...sub, endpoint: "http://fcm.googleapis.com/x" })).toBeNull();
    expect(parseSubscription({ ...sub, endpoint: "https://localhost/x" })).toBeNull();
    expect(parseSubscription({ ...sub, endpoint: "https://10.0.0.1/x" })).toBeNull();
    expect(
      parseSubscription({ ...sub, keys: { p256dh: "short", auth: sub.keys.auth } }),
    ).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("leadPushPayload", () => {
  it("links to the lead and carries no visitor contact details", () => {
    const payload = leadPushPayload({
      leadId: "11111111-1111-4111-8111-111111111111",
      businessName: "Acme Plumbing",
      kind: "New quote",
      service: "Drain cleaning",
    });
    expect(payload.url).toBe("/app/leads?lead=11111111-1111-4111-8111-111111111111");
    expect(JSON.stringify(payload)).not.toMatch(/@|\+\d|\(\d{3}\)|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/);
  });
});

describe("sendLeadPush", () => {
  const input = {
    organizationId: "org-1",
    leadId: "11111111-1111-4111-8111-111111111111",
    businessName: "Acme",
    kind: "New lead",
  };

  it("does nothing until VAPID is configured", async () => {
    const { db } = fakeDb([]);
    const fetchImpl = vi.fn();
    expect(await sendLeadPush(input, { db, config: null, fetchImpl })).toMatchObject({
      skipped: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("encrypts with Web Crypto (aes128gcm + VAPID) and records success; disables gone endpoints", async () => {
    const { publicKey, privateKey } = await vapidPair();
    const config = { publicKey, privateKey, subject: "mailto:ops@revoragrowthsystems.com" };
    const a = await browserSubscription();
    const b = await browserSubscription();
    const { db, updates } = fakeDb([
      { id: "a", endpoint: a.endpoint, ...a.keys },
      { id: "b", endpoint: "https://updates.push.services.mozilla.com/wpush/v2/gone", ...b.keys },
    ]);
    const seen: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response(null, { status: String(url).includes("gone") ? 410 : 201 });
    }) as unknown as typeof fetch;

    const result = await sendLeadPush(input, {
      db,
      config,
      fetchImpl,
      build: buildPushPayload,
    });
    expect(result).toEqual({ sent: 1, failed: 1, disabled: 1 });
    const headers = seen[0]!.headers;
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("authorization")).toMatch(/^vapid t=.+, k=/);
    expect(headers.get("urgency")).toBe("high");
    expect(updates.find((u) => u.id === "a")?.values).toMatchObject({ failure_count: 0 });
    expect(updates.find((u) => u.id === "b")?.values).toHaveProperty("disabled_at");
  });

  it("never throws when the lookup or the push service fails", async () => {
    const { db } = fakeDb([], "boom");
    const config = { ...(await vapidPair()), subject: "mailto:a@b.co" };
    await expect(sendLeadPush(input, { db, config })).resolves.toMatchObject({
      skipped: "lookup_failed",
    });
    const sub = await browserSubscription();
    const ok = fakeDb([{ id: "a", endpoint: sub.endpoint, ...sub.keys }]);
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(sendLeadPush(input, { db: ok.db, config, fetchImpl })).resolves.toEqual({
      sent: 0,
      failed: 1,
      disabled: 0,
    });
  });
});
