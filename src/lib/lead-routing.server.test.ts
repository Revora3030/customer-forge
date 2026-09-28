import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyLeadWebhookFailure,
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

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "not_configured" });
    if (result.ok) expect(result.attemptedAt).toMatch(/^20/);
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

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.attemptedAt).toMatch(/^20/);
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
  it("classifies transient webhook failures for retry without retrying automatically", () => {
    expect(classifyLeadWebhookFailure(500, "http").retryable).toBe(true);
    expect(classifyLeadWebhookFailure(503, "http").retryable).toBe(true);
    expect(classifyLeadWebhookFailure(429, "http").retryable).toBe(true);
    expect(classifyLeadWebhookFailure(408, "http").retryable).toBe(true);
    expect(classifyLeadWebhookFailure(400, "http").retryable).toBe(false);
    expect(classifyLeadWebhookFailure(404, "http").retryable).toBe(false);
    expect(classifyLeadWebhookFailure(null, "timeout").retryable).toBe(true);
    expect(classifyLeadWebhookFailure(null, "network").retryable).toBe(true);
  });

  it("returns exact HTTP status and attempt timestamp for provider failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 502 }),
    );

    const result = await dispatchLeadWebhook("https://hooks.example.com/lead", {
      event: "lead.created",
      timestamp: "2026-09-28T00:00:00.000Z",
      workspace_id: "workspace-1",
      lead: {
        name: "Jordan",
        email: "jordan@example.com",
        phone: null,
        service: "Detailing",
        message: "Need a quote",
        source_url: "https://example.com/contact",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.statusCode).toBe(502);
    expect(result.retryable).toBe(true);
    expect(result.kind).toBe("http");
    expect(result.attemptedAt).toMatch(/^2026-|^20/);
  });

  it("classifies timeout as retryable transport failure without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    );

    const result = await dispatchLeadWebhook("https://hooks.example.com/lead", {
      event: "lead.created",
      timestamp: "2026-09-28T00:00:00.000Z",
      workspace_id: "workspace-1",
      lead: {
        name: "Jordan",
        email: null,
        phone: "555-0100",
        service: "Detailing",
        message: null,
        source_url: "https://example.com/contact",
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "timeout",
      statusCode: null,
      retryable: true,
      kind: "timeout",
    });
    if (!result.ok) expect(result.attemptedAt).toMatch(/^20/);
  });

  it("never sends a private webhook target to fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await dispatchLeadWebhook("http://169.254.169.254/latest/meta-data", {
      event: "lead.created",
      timestamp: "2026-09-28T00:00:00.000Z",
      workspace_id: "workspace-1",
      lead: {
        name: "Jordan",
        email: null,
        phone: null,
        service: null,
        message: null,
        source_url: "https://example.com/contact",
      },
    });

    expect(result.ok).toBe(true);
    expect("skipped" in result && result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
