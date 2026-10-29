import { describe, expect, it, vi } from "vitest";
import { completedWebhookDuplicate, finishClaimedWebhook } from "./webhook-lifecycle";

describe("webhook acknowledgement lifecycle", () => {
  it("acknowledges only completed duplicates, never active or uncertain claims", () => {
    expect(completedWebhookDuplicate({ processed: true }, null)).toBe(true);
    expect(completedWebhookDuplicate({ processed: false }, null)).toBe(false);
    expect(completedWebhookDuplicate(null, null)).toBe(false);
    expect(completedWebhookDuplicate({ processed: true }, new Error("read failed"))).toBe(false);
  });
  it("settles successful work without releasing its claim", async () => {
    const order: string[] = [];
    await finishClaimedWebhook({
      process: async () => { order.push("process"); },
      settle: async () => { order.push("settle"); },
      release: async () => { order.push("release"); },
    });
    expect(order).toEqual(["process", "settle"]);
  });
  it.each(["process", "settle"])("releases its own unfinished claim and fails on %s failure", async (step) => {
    const release = vi.fn(async () => undefined);
    const failure = new Error(`${step} failed`);
    await expect(finishClaimedWebhook({
      process: async () => { if (step === "process") throw failure; },
      settle: async () => { if (step === "settle") throw failure; },
      release,
    })).rejects.toThrow(`${step} failed`);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("reports operator review instead of claiming success when release also fails", async () => {
    await expect(finishClaimedWebhook({
      process: async () => { throw new Error("processing failed"); },
      settle: async () => undefined,
      release: async () => { throw new Error("database unavailable"); },
    })).rejects.toThrow("operator review is required");
  });
});