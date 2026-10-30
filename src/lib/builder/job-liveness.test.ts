import { describe, expect, it } from "vitest";
import {
  AUTO_BUILD_COOLDOWN_AFTER_FAILURE_MS,
  QUEUED_PICKUP_TIMEOUT_MS,
  STALLED_LEASE_GRACE_MS,
  blocksAutoBuild,
  isRetryWait,
  jobIsActive,
  jobLiveness,
  stopWaiting,
  stopWaitingMessage,
} from "@/lib/builder/job-liveness";

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

describe("when the chat stops waiting on a build", () => {
  // The real job that showed "Your build hasn't started yet" after eleven minutes
  // of work: created 15:44:40, attempt 1 failed 15:55:39 and went back to
  // "queued" with a retry due 15:56:00 (original created_at kept).
  const created = iso(-11 * 60_000 - 10_000);
  const retrying = {
    status: "queued",
    created_at: created,
    started_at: iso(-11 * 60_000),
    attempts: 1,
    error_message: "[provider] The AI design team did not plan this site's pictures",
    failure_kind: "provider",
    lease_expires_at: iso(10_000),
    updated_at: iso(-1_000),
  };

  it("does not call a build that is waiting for its retry 'not started'", () => {
    expect(isRetryWait(retrying)).toBe(true);
    expect(stopWaiting(retrying, NOW)).toBeNull();
  });

  it("still stops on a build no worker ever claimed", () => {
    const untouched = { status: "queued", created_at: iso(-QUEUED_PICKUP_TIMEOUT_MS - 1_000), attempts: 0 };
    expect(isRetryWait(untouched)).toBe(false);
    expect(stopWaiting(untouched, NOW)).toBe("never_started");
    expect(stopWaiting({ ...untouched, created_at: iso(-60_000) }, NOW)).toBeNull();
  });

  it("counts a retry from the moment it became due, so a parked build is not abandoned early", () => {
    // Parked for AI capacity: the retry is due in 45 minutes.
    expect(stopWaiting({ ...retrying, lease_expires_at: iso(45 * 60_000), updated_at: iso(-3_600_000) }, NOW)).toBeNull();
    // Due ten minutes ago and still not resumed: now it is overdue.
    expect(stopWaiting({ ...retrying, lease_expires_at: iso(-QUEUED_PICKUP_TIMEOUT_MS - 1_000), updated_at: iso(-QUEUED_PICKUP_TIMEOUT_MS - 2_000) }, NOW)).toBe("retry_overdue");
  });

  it("treats a build handed back between slices as a retry wait too", () => {
    const handedBack = { status: "queued", created_at: created, started_at: iso(-300_000), current_step: "refined", attempts: 0, lease_expires_at: null, updated_at: iso(-2_000) };
    expect(isRetryWait(handedBack)).toBe(true);
    expect(stopWaiting(handedBack, NOW)).toBeNull();
  });

  it("stops on a running build whose lease lapsed, and ignores finished ones", () => {
    expect(stopWaiting({ status: "processing", lease_expires_at: iso(-STALLED_LEASE_GRACE_MS - 1), updated_at: iso(-400_000) }, NOW)).toBe("stalled");
    expect(stopWaiting({ status: "processing", lease_expires_at: iso(60_000), updated_at: iso(-1_000) }, NOW)).toBeNull();
    for (const status of ["completed", "failed", "cancelled"]) expect(stopWaiting({ status, created_at: created }, NOW)).toBeNull();
    expect(stopWaiting(null, NOW)).toBeNull();
  });

  it("says a retrying build was waiting to try again, never that it hadn't started", () => {
    expect(stopWaitingMessage("never_started")).toMatch(/hasn't started yet/);
    expect(stopWaitingMessage("retry_overdue")).not.toMatch(/hasn't started/);
    expect(stopWaitingMessage("retry_overdue")).toMatch(/try again/);
    for (const reason of ["never_started", "retry_overdue", "stalled"] as const) expect(stopWaitingMessage(reason)).toMatch(/Nothing was published/);
  });
});

describe("when the builder may start a build on its own", () => {
  it("never restarts one that is in hand or that the owner stopped", () => {
    for (const status of ["queued", "processing", "cancelled"]) expect(blocksAutoBuild({ status }, NOW), status).toBe(true);
  });

  it("does not silently re-queue a build that failed recently, however often the page is opened", () => {
    expect(blocksAutoBuild({ status: "failed", completed_at: iso(-40 * 60_000) }, NOW)).toBe(true);
    expect(blocksAutoBuild({ status: "failed", completed_at: iso(-AUTO_BUILD_COOLDOWN_AFTER_FAILURE_MS + 60_000) }, NOW)).toBe(true);
  });

  it("allows one fresh automatic start once the failure is a day old", () => {
    expect(blocksAutoBuild({ status: "failed", completed_at: iso(-AUTO_BUILD_COOLDOWN_AFTER_FAILURE_MS - 60_000) }, NOW)).toBe(false);
  });

  it("treats a failure it cannot date as recent, and allows the first-ever build", () => {
    expect(blocksAutoBuild({ status: "failed" }, NOW)).toBe(true);
    expect(blocksAutoBuild(null, NOW)).toBe(false);
    expect(blocksAutoBuild({ status: "completed" }, NOW)).toBe(false);
  });
});
