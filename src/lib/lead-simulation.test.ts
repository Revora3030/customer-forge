import { describe, expect, it } from "vitest";
import {
  alertLatencyMs,
  buildSimulationChecklist,
  formatLatency,
  reasonText,
  simulationPassed,
  type SimulationCheck,
  type SimulationRows,
} from "@/lib/lead-simulation";

const base: SimulationRows = {
  validationError: null,
  lead: { id: "l1", status: "new", source: "test_lead", created_at: "2026-11-04T12:00:00.000Z" },
  alertLog: { status: "sent", reason: null, recipient: "me@example.com", created_at: "2026-11-04T12:00:01.250Z" },
  alertConfigured: true,
  webhookLog: null,
  webhookConfigured: false,
  testSource: "test_lead",
};

const byKey = (rows: SimulationRows) =>
  Object.fromEntries(buildSimulationChecklist(rows).map((c) => [c.key, c])) as Record<SimulationCheck["key"], SimulationCheck>;

describe("lead simulation checklist", () => {
  it("passes every line when the stored rows are all good, and reports latency", () => {
    const checks = buildSimulationChecklist(base);
    expect(checks.map((c) => c.key)).toEqual(["validation", "lead_saved", "owner_alert", "alert_latency", "webhook", "kept_out"]);
    expect(simulationPassed(checks)).toBe(true);
    expect(byKey(base).alert_latency.detail).toContain("1.3 s");
    expect(byKey(base).webhook.status).toBe("skipped");
  });

  it("shows a failed alert as failed, with a plain reason, and no latency line", () => {
    const rows = { ...base, alertLog: { ...base.alertLog!, status: "failed", reason: "recipient_suppressed" } };
    const checks = byKey(rows);
    expect(checks.owner_alert.status).toBe("fail");
    expect(checks.owner_alert.detail).toMatch(/blocked by the email provider/);
    expect(checks.alert_latency).toBeUndefined();
    expect(simulationPassed(buildSimulationChecklist(rows))).toBe(false);
  });

  it("fails when an alert inbox exists but no alert row was stored", () => {
    expect(byKey({ ...base, alertLog: null }).owner_alert.status).toBe("fail");
  });

  it("skips the alert line when no inbox is set up", () => {
    expect(byKey({ ...base, alertConfigured: false, alertLog: null }).owner_alert.status).toBe("skipped");
  });

  it("stops after a validation failure", () => {
    const checks = buildSimulationChecklist({ ...base, validationError: "Please enter your name." });
    expect(checks).toHaveLength(1);
    expect(checks[0]?.status).toBe("fail");
  });

  it("fails when no lead row came back or stage is not New", () => {
    expect(byKey({ ...base, lead: null }).lead_saved.status).toBe("fail");
    expect(byKey({ ...base, lead: { ...base.lead!, status: "contacted" } }).lead_saved.status).toBe("fail");
  });

  it("reads the webhook line from the delivery log", () => {
    const ok = byKey({ ...base, webhookConfigured: true, webhookLog: { delivery_status: "delivered", http_status: null, reason: null, attempted_at: "x" } });
    expect(ok.webhook.status).toBe("pass");
    const bad = byKey({ ...base, webhookConfigured: true, webhookLog: { delivery_status: "failed", http_status: 500, reason: "http_500", attempted_at: "x" } });
    expect(bad.webhook.status).toBe("fail");
    expect(bad.webhook.detail).toContain("HTTP 500");
    expect(byKey({ ...base, webhookConfigured: true, webhookLog: null }).webhook.status).toBe("fail");
  });

  it("fails the kept-out line if the lead is not labeled as a test", () => {
    expect(byKey({ ...base, lead: { ...base.lead!, source: "website" } }).kept_out.status).toBe("fail");
  });
});

describe("latency helpers", () => {
  it("computes and formats latency", () => {
    expect(alertLatencyMs("2026-11-04T12:00:00Z", "2026-11-04T12:00:00.400Z")).toBe(400);
    expect(alertLatencyMs(null, "x")).toBeNull();
    expect(alertLatencyMs("2026-11-04T12:00:05Z", "2026-11-04T12:00:00Z")).toBe(0);
    expect(formatLatency(400)).toBe("400 ms");
    expect(formatLatency(90_000)).toBe("2 min");
    expect(reasonText(null)).toBe("no reason given");
    expect(reasonText("some_code")).toBe("some code");
  });
});
