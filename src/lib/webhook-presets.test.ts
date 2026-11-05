import { describe, expect, it } from "vitest";
import {
  sampleLeadWebhookBody,
  TEST_WEBHOOK_LEAD_ID,
  WEBHOOK_PRESETS,
  webhookPreset,
  webhookTestFailureText,
} from "@/lib/webhook-presets";
import { buildLeadWebhookPayload } from "@/lib/lead-routing.server";

describe("webhook presets", () => {
  it("has Zapier, Make and HighLevel with steps and field mapping", () => {
    expect(WEBHOOK_PRESETS.map((p) => p.id)).toEqual(["zapier", "make", "highlevel"]);
    for (const preset of WEBHOOK_PRESETS) {
      expect(preset.steps.length).toBeGreaterThanOrEqual(3);
      expect(preset.urlHint.startsWith("https://")).toBe(true);
      expect(preset.mapping.map((m) => m.path)).toContain("lead.lead_id");
    }
    expect(webhookPreset("make")?.name).toBe("Make");
    expect(webhookPreset("nope")).toBeUndefined();
  });

  it("every mapped path exists in a real lead.created body", () => {
    const real = buildLeadWebhookPayload({
      organizationId: "o",
      leadId: "l",
      name: "n",
      sourceUrl: "u",
    }) as Record<string, unknown>;
    for (const { path } of WEBHOOK_PRESETS[0]!.mapping) {
      const [head, key] = path.split(".") as [string, string];
      expect(Object.keys(real[head] as object)).toContain(key);
    }
  });
});

describe("sample test body", () => {
  const body = sampleLeadWebhookBody("org-1", new Date("2026-11-04T12:00:00Z"));

  it("is clearly a test and uses reserved contact details", () => {
    expect(body.test).toBe(true);
    expect(body.lead.name).toMatch(/TEST/);
    expect(body.lead.email).toMatch(/@example\.com$/);
    expect(body.lead.phone).toMatch(/555/);
    expect(body.lead.lead_id).toBe(TEST_WEBHOOK_LEAD_ID);
    expect(body.idempotency_key).toContain(":test:");
  });

  it("has the same keys as a real delivery, plus test", () => {
    const real = buildLeadWebhookPayload({
      organizationId: "org-1",
      leadId: "l",
      name: "n",
      sourceUrl: "u",
    });
    expect(
      Object.keys(body)
        .filter((k) => k !== "test")
        .sort(),
    ).toEqual(Object.keys(real).sort());
    expect(Object.keys(body.lead).sort()).toEqual(Object.keys(real.lead).sort());
  });
});

describe("test failure text", () => {
  it("explains failures plainly", () => {
    expect(webhookTestFailureText("http_404", 404)).toBe("Your webhook answered HTTP 404.");
    expect(webhookTestFailureText("timeout", null)).toMatch(/5 seconds/);
    expect(webhookTestFailureText("webhook_transport_error", null)).toMatch(/could not be reached/);
  });
});
