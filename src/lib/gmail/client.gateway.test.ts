import { afterEach, describe, expect, it, vi } from "vitest";
import { gmailConfig, sendGmailRaw } from "./client.server";

const KEYS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL", "LOVABLE_API_KEY", "GOOGLE_MAIL_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  vi.unstubAllGlobals();
});
const setGateway = () => {
  for (const k of KEYS) delete process.env[k];
  process.env["LOVABLE_API_KEY"] = "lov";
  process.env["GOOGLE_MAIL_API_KEY"] = "conn";
  process.env["GMAIL_SENDER_EMAIL"] = "owner@example.com";
};

describe("connected Gmail sender", () => {
  it("uses the connected Gmail when direct OAuth secrets are absent", () => {
    setGateway();
    expect(gmailConfig()?.gateway).toEqual({ lovableKey: "lov", connectionKey: "conn" });
  });

  it("is not configured without the sender address", () => {
    setGateway();
    delete process.env["GMAIL_SENDER_EMAIL"];
    expect(gmailConfig()).toBeNull();
  });

  it("sends through the gateway with both keys and no token exchange", async () => {
    setGateway();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1", threadId: "t1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendGmailRaw(gmailConfig()!, "raw");
    expect(result).toMatchObject({ ok: true, id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send");
    expect(init.headers).toMatchObject({ authorization: "Bearer lov", "x-connection-api-key": "conn" });
  });
});
