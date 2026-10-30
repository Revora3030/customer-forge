import { describe, expect, it } from "vitest";
import { completedWebhookDuplicate, finishClaimedWebhook } from "./webhook-lifecycle";

describe("webhook acknowledgement lifecycle", () => {
  const expected = { organizationId: "org", eventType: "invoice.paid", resourceId: "inv", environment: "sandbox" };
  const completed = { processed: true, verification_status: "verified", organization_id: "org", event_type: "invoice.paid", resource_id: "inv", payload: { environment: "sandbox" } };
  it("acknowledges only completed duplicates, never active or uncertain claims", () => {
    expect(completedWebhookDuplicate(completed, null, expected)).toBe(true);
    expect(completedWebhookDuplicate({ ...completed, processed: false }, null, expected)).toBe(false);
    expect(completedWebhookDuplicate(null, null, expected)).toBe(false);
    expect(completedWebhookDuplicate(completed, new Error("read failed"), expected)).toBe(false);
    expect(completedWebhookDuplicate(completed, null, { ...expected, environment: "live" })).toBe(false);
    expect(completedWebhookDuplicate(completed, null, { ...expected, organizationId: "other" })).toBe(false);
  });
  it("settles successful work without releasing its claim", async () => {
    const order: string[] = [];
    await finishClaimedWebhook({
      process: async () => { order.push("process"); },
      settle: async () => { order.push("settle"); },
    });
    expect(order).toEqual(["process", "settle"]);
  });
  it.each(["process", "settle"])("retains the unfinished claim and fails on %s failure", async (step) => {
    const failure = new Error(`${step} failed`);
    await expect(finishClaimedWebhook({
      process: async () => { if (step === "process") throw failure; },
      settle: async () => { if (step === "settle") throw failure; },
    })).rejects.toThrow(`${step} failed`);
  });
});