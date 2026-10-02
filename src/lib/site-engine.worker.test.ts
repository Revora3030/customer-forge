import { describe, expect, it } from "vitest";
import { isLeaseExpired, shouldRecoverStaleProcessingJob } from "@/lib/site-engine.worker.server";

describe("generation job lease recovery", () => {
  const now = new Date("2026-10-02T15:00:00.000Z");

  it("treats an absent lease as free for claiming, but not as stale processing work", () => {
    expect(isLeaseExpired(null, now)).toBe(true);
    expect(shouldRecoverStaleProcessingJob("queued", null, now)).toBe(false);
  });

  it("only recovers processing jobs with an expired lease", () => {
    expect(
      shouldRecoverStaleProcessingJob("processing", "2026-10-02T14:59:00.000Z", now),
    ).toBe(true);
    expect(
      shouldRecoverStaleProcessingJob("processing", "2026-10-02T15:01:00.000Z", now),
    ).toBe(false);
    expect(shouldRecoverStaleProcessingJob("queued", "2026-10-02T14:59:00.000Z", now)).toBe(false);
  });

  it("fails closed for malformed processing lease timestamps", () => {
    expect(shouldRecoverStaleProcessingJob("processing", "not-a-date", now)).toBe(true);
  });
});
