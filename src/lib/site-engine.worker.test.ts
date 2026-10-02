import { describe, expect, it } from "vitest";
import {
  isLeaseExpired,
  shouldRecoverStaleProcessingJob,
} from "@/lib/site-engine.worker.server";

describe("site-engine lease recovery guards", () => {
  const now = new Date("2026-10-02T15:00:00.000Z");

  it("treats a missing lease as available for an unclaimed queued job", () => {
    expect(isLeaseExpired(null, now)).toBe(true);
    expect(isLeaseExpired(undefined, now)).toBe(true);
  });

  it("recognizes only expired processing leases as stale", () => {
    expect(
      shouldRecoverStaleProcessingJob(
        "processing",
        "2026-10-02T14:59:00.000Z",
        now,
      ),
    ).toBe(true);
    expect(
      shouldRecoverStaleProcessingJob(
        "processing",
        "2026-10-02T15:01:00.000Z",
        now,
      ),
    ).toBe(false);
    expect(
      shouldRecoverStaleProcessingJob("queued", null, now),
    ).toBe(false);
  });

  it("fails closed for malformed processing lease timestamps", () => {
    expect(
      shouldRecoverStaleProcessingJob("processing", "not-a-date", now),
    ).toBe(true);
  });
});
