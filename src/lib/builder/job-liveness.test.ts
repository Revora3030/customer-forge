import { describe, expect, it } from "vitest";
import { STALLED_LEASE_GRACE_MS, jobIsActive, jobLiveness } from "@/lib/builder/job-liveness";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("build job liveness", () => {
  it("treats a live lease as running", () => {
    expect(jobLiveness({ status: "processing", lease_expires_at: iso(90_000), updated_at: iso(-5_000) }, NOW)).toBe(
      "running",
    );
  });

  it("gives a just-lapsed lease the grace period (a heartbeat may be in flight)", () => {
    expect(jobLiveness({ status: "processing", lease_expires_at: iso(-30_000), updated_at: iso(-200_000) }, NOW)).toBe(
      "running",
    );
  });

  it("flags a processing job whose lease lapsed over 60s ago with no updates as stalled", () => {
    const row = { status: "processing", lease_expires_at: iso(-STALLED_LEASE_GRACE_MS - 1), updated_at: iso(-400_000) };
    expect(jobLiveness(row, NOW)).toBe("stalled");
    expect(jobIsActive(row, NOW)).toBe(false);
  });

  it("does not call a job stalled while its row is still being updated", () => {
    expect(jobLiveness({ status: "processing", lease_expires_at: iso(-120_000), updated_at: iso(-10_000) }, NOW)).toBe(
      "running",
    );
  });

  it("recovers a processing row that has no lease or timestamps at all", () => {
    expect(jobLiveness({ status: "processing", lease_expires_at: null, updated_at: null }, NOW)).toBe("stalled");
  });

  it("classifies queued and terminal jobs", () => {
    expect(jobLiveness({ status: "queued" }, NOW)).toBe("queued");
    expect(jobIsActive({ status: "queued" }, NOW)).toBe(true);
    expect(jobLiveness({ status: "completed" }, NOW)).toBe("idle");
    expect(jobLiveness({ status: "failed" }, NOW)).toBe("idle");
    expect(jobLiveness(null, NOW)).toBe("idle");
  });
});
