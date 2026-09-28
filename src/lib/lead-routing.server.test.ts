import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchLeadWebhook,
  validateLeadWebhookUrl,
} from "@/lib/lead-routing.server";

describe("lead webhook routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts public http(s) endpoints and rejects obvious private targets", () => {
    expect(validateLeadWebhookUrl("https://hooks.example.com/lead")).toBe(
      "https://hooks.example.com/lead",
    );
    expect(validateLeadWebhookUrl("http://localhost:3000/hook")).toBeNull();
    expect(validateLeadWebhookUrl("http://127.0.0.1/hook")).toBeNull();
    expect(validateLeadWebhookUrl("http://192.168.1.20/hook")).toBeNull();
    expect(validateLeadWebhookUrl("javascript:alert(1)")).toBeNull();
  });

  it("treats an absent webhook as a successful no-op", async () => {
    const result = await dispatchLeadWebhook(undefined, {
      event: "lead.created",
      timestamp: new Date().toISOString(),
      workspace_id: "workspace-1",
      lead: {
        name: "Jordan",
        email: null,
        phone: "555-0100",
        service: "Detailing",
        message: "Need a quote",
        source_url: "https://example.com/contact",
      },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: "not_configured" });
  });

  it("posts the lead event without leaking credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const payload = {
      event: "lead.created" as const,
      timestamp: "2026-09-27T00:00:00.000Z",
      workspace_id: "workspace-1",
      lead: {
        name: "Jordan",
        email: "jordan@example.com",
        phone: "555-0100",
        service: "Detailing",
        message: "Need a quote",
        source_url: "https://example.com/contact",
      },
    };

    const result = await dispatchLeadWebhook("https://hooks.example.com/lead", payload);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://hooks.example.com/lead");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-revora-event": "lead.created",
      "x-revora-workspace-id": "workspace-1",
    });
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });
});
