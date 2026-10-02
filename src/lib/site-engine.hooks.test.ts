import { describe, expect, it } from "vitest";
import { queuePumpDelay } from "@/lib/site-engine.hooks";

describe("queuePumpDelay", () => {
  it("nudges queued work promptly", () => {
    expect(queuePumpDelay({ status: "queued" }, 1_000)).toBe(500);
  });

  it("waits for an active processing lease before recovery", () => {
    expect(
      queuePumpDelay(
        { status: "processing", lease_expires_at: new Date(6_000).toISOString() },
        1_000,
      ),
    ).toBe(5_250);
  });

  it("recovers expired or missing processing leases promptly", () => {
    expect(
      queuePumpDelay(
        { status: "processing", lease_expires_at: new Date(500).toISOString() },
        1_000,
      ),
    ).toBe(250);
    expect(queuePumpDelay({ status: "processing", lease_expires_at: null }, 1_000)).toBe(500);
  });

  it("does not pump terminal jobs", () => {
    expect(queuePumpDelay({ status: "completed" }, 1_000)).toBeNull();
    expect(queuePumpDelay({ status: "failed" }, 1_000)).toBeNull();
  });
});