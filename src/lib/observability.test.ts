import { describe, expect, it } from "vitest";
import { buildTimeline, systemHealth } from "@/lib/observability";

const job = (over: Partial<Parameters<typeof buildTimeline>[0]["jobs"][number]> = {}) => ({
  id: "j1",
  status: "completed",
  progress: 100,
  current_step: null,
  error_message: null,
  created_at: "2026-01-01T10:00:00.000Z",
  completed_at: "2026-01-01T10:05:00.000Z",
  ...over,
});

describe("observability timeline", () => {
  it("returns nothing when there is no activity", () => {
    const events = buildTimeline({ jobs: [], runs: [], audits: [] });
    expect(events).toEqual([]);
    expect(systemHealth(events).summary).toMatch(/nothing to report/i);
  });

  it("reports a failed build as a problem with the real error", () => {
    const events = buildTimeline({
      jobs: [job({ status: "failed", error_message: "AI provider timed out" })],
      runs: [],
      audits: [],
    });
    expect(events[0]?.level).toBe("problem");
    expect(events[0]?.detail).toBe("AI provider timed out");
    expect(systemHealth(events).problems).toBe(1);
  });

  it("shows in-progress builds as working, not finished", () => {
    const events = buildTimeline({
      jobs: [job({ status: "running", progress: 40, current_step: "Writing your services page" })],
      runs: [],
      audits: [],
    });
    expect(events[0]?.level).toBe("working");
    expect(events[0]?.title).toContain("40%");
    expect(systemHealth(events).summary).toMatch(/in progress/i);
  });

  it("does not claim an automation was delivered when it is only scheduled", () => {
    const events = buildTimeline({
      jobs: [],
      runs: [
        {
          id: "r1",
          action_type: "email",
          status: "scheduled",
          trigger_event: "lead_created",
          recipient: "owner@example.com",
          scheduled_for: "2026-01-02T09:00:00.000Z",
          sent_at: null,
        },
      ],
      audits: [],
    });
    expect(events[0]?.title).toBe("Email scheduled");
    expect(events[0]?.level).toBe("working");
  });

  it("sorts newest first across all sources and honours the limit", () => {
    const events = buildTimeline({
      jobs: [job({ id: "old", completed_at: "2026-01-01T00:00:00.000Z" })],
      runs: [],
      audits: [
        {
          id: "a1",
          action: "website.published",
          entity: null,
          created_at: "2026-02-01T00:00:00.000Z",
        },
      ],
      limit: 1,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Website published");
  });

  it("flags rollback events as problems needing attention", () => {
    const events = buildTimeline({
      jobs: [],
      runs: [],
      audits: [
        {
          id: "a2",
          action: "selfheal.rolled_back",
          entity: null,
          created_at: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(events[0]?.level).toBe("problem");
    expect(systemHealth(events).summary).toMatch(/needs attention/i);
  });
});

describe("blocked and repeated audit events", () => {
  const audit = (id: string, action: string, created_at: string) => ({
    id,
    action,
    entity: null,
    created_at,
  });

  it("never presents a blocked publish as a success", () => {
    const events = buildTimeline({
      jobs: [],
      runs: [],
      audits: [audit("a1", "PUBLISH_BLOCKED", "2026-01-01T10:00:00.000Z")],
    });
    expect(events[0]?.level).toBe("problem");
    expect(events[0]?.title).toBe("A publish was stopped before it went live");
    expect(systemHealth(events).problems).toBe(1);
    expect(systemHealth(events).summary).not.toMatch(/completed successfully/i);
  });

  it("folds identical repeats into one honest line with the real count", () => {
    const events = buildTimeline({
      jobs: [],
      runs: [],
      audits: [
        audit("a1", "publish_blocked", "2026-01-03T10:00:00.000Z"),
        audit("a2", "publish_blocked", "2026-01-02T10:00:00.000Z"),
        audit("a3", "publish_blocked", "2026-01-01T10:00:00.000Z"),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.repeats).toBe(3);
    expect(events[0]?.detail).toBe("3 times — newest shown");
  });
});
