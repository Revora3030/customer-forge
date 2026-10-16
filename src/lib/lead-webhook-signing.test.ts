import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLeadWebhookPayload,
  dispatchLeadWebhook,
  newLeadWebhookSecret,
  signLeadWebhook,
} from "@/lib/lead-routing.server";

afterEach(() => vi.restoreAllMocks());

const payload = buildLeadWebhookPayload({
  organizationId: "org-1",
  leadId: "lead-1",
  name: "Jordan",
  sourceUrl: "https://example.com/contact",
  now: new Date("2026-10-16T00:00:00Z"),
});

function publicEndpoint() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).startsWith("https://cloudflare-dns.com/")) return Response.json({ Answer: [{ type: 1, data: "8.8.8.8" }] });
    return new Response(null, { status: 204 });
  });
}

const webhookCall = (fetchMock: ReturnType<typeof publicEndpoint>) =>
  fetchMock.mock.calls.find(([url]) => String(url).startsWith("https://hooks.example.com/"))!;

describe("lead webhook signing", () => {
  it("creates distinct secrets in the stored format", () => {
    const a = newLeadWebhookSecret();
    expect(a).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(newLeadWebhookSecret()).not.toBe(a);
  });

  it("signs t.body with HMAC-SHA256 the way a receiver verifies it", async () => {
    const secret = "whsec_" + "ab".repeat(24);
    const body = JSON.stringify(payload);
    const expected = createHmac("sha256", secret).update(`1760572800.${body}`).digest("hex");
    expect(await signLeadWebhook(secret, body, 1760572800)).toBe(`t=1760572800,v1=${expected}`);
  });

  it("signs the exact body it sends", async () => {
    const fetchMock = publicEndpoint();
    const secret = newLeadWebhookSecret();
    await dispatchLeadWebhook("https://hooks.example.com/lead", payload, secret);
    const [, init] = webhookCall(fetchMock);
    const header = (init?.headers as Record<string, string>)["x-revora-signature"]!;
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header)!;
    expect(createHmac("sha256", secret).update(`${t}.${String(init?.body)}`).digest("hex")).toBe(v1);
  });

  it("sends no signature header when the workspace has no secret", async () => {
    const fetchMock = publicEndpoint();
    await dispatchLeadWebhook("https://hooks.example.com/lead", payload, null);
    const [, init] = webhookCall(fetchMock);
    expect(init?.headers).not.toHaveProperty("x-revora-signature");
  });

  it("keeps the secret in a manager-only table, never in website_settings", () => {
    const sql = readFileSync("supabase/migrations/20261016150000_lead_webhook_secrets.sql", "utf8");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.lead_webhook_secrets FROM anon, authenticated;");
    expect(sql).not.toMatch(/GRANT[^;]*lead_webhook_secrets[^;]*\banon\b/i);
    expect(sql.match(/org_role_at_least\(organization_id, 'manager'\)/g)?.length).toBe(4);
  });

  it("never fails a webhook save because the secret couldn't be created", () => {
    const fn = readFileSync("src/lib/notifications.functions.ts", "utf8");
    expect(fn).toMatch(/try \{\s*await ensureLeadWebhookSecret\(context\.supabase, data\.organizationId, false\);/);
  });
});
