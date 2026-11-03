import { describe, expect, it } from "vitest";

import {
  ESCALATE_AFTER_MINUTES,
  dueForEscalation,
  escalationRecipients,
  formatMinutes,
  responseLabel,
  responseStatus,
} from "@/lib/lead-first-response";

const NOW = Date.parse("2026-11-03T15:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("responseStatus", () => {
  it("reports how fast a lead was answered", () => {
    const s = responseStatus({ created_at: ago(30), first_response_at: ago(27) }, NOW);
    expect(s).toEqual({ kind: "answered", minutes: 3, withinGoal: true });
    expect(responseLabel(s)).toBe("First reply in 3m");
    expect(responseStatus({ created_at: ago(30), first_response_at: ago(10) }, NOW)).toMatchObject({ withinGoal: false, minutes: 20 });
  });

  it("reports how long an unanswered lead has waited, overdue after 5 minutes", () => {
    expect(responseStatus({ created_at: ago(4), first_response_at: null }, NOW)).toEqual({ kind: "waiting", minutes: 4, overdue: false });
    const late = responseStatus({ created_at: ago(12) }, NOW);
    expect(late).toEqual({ kind: "waiting", minutes: 12, overdue: true });
    expect(responseLabel(late)).toBe("Waiting 12m");
    expect(responseStatus({ created_at: "nope" }, NOW)).toEqual({ kind: "unknown" });
    expect(responseLabel({ kind: "unknown" })).toBeNull();
  });

  it("formats durations compactly", () => {
    expect([0, 5, 59, 60, 95, 47 * 60, 72 * 60].map(formatMinutes)).toEqual(["<1m", "5m", "59m", "1h", "1h 35m", "47h", "3d"]);
  });
});

describe("dueForEscalation", () => {
  it("escalates a new, unanswered lead once it is 5 to 60 minutes old", () => {
    expect(ESCALATE_AFTER_MINUTES).toBe(5);
    expect(dueForEscalation({ created_at: ago(4), status: "new" }, NOW)).toBe(false);
    expect(dueForEscalation({ created_at: ago(5), status: "new" }, NOW)).toBe(true);
    expect(dueForEscalation({ created_at: ago(45), status: "new" }, NOW)).toBe(true);
    expect(dueForEscalation({ created_at: ago(61), status: "new" }, NOW)).toBe(false);
  });

  it("never escalates an answered, already escalated or progressed lead", () => {
    expect(dueForEscalation({ created_at: ago(10), status: "new", first_response_at: ago(8) }, NOW)).toBe(false);
    expect(dueForEscalation({ created_at: ago(10), status: "new", response_escalated_at: ago(4) }, NOW)).toBe(false);
    expect(dueForEscalation({ created_at: ago(10), status: "contacted" }, NOW)).toBe(false);
  });
});

describe("escalationRecipients", () => {
  it("reaches every distinct inbox on the profile, in preference order", () => {
    expect(escalationRecipients({ notification_email: "desk@acme.test", email: "Desk@acme.test", owner_email: "boss@acme.test" })).toEqual([
      "desk@acme.test",
      "boss@acme.test",
    ]);
    expect(escalationRecipients({ email: "not-an-email", owner_email: "boss@acme.test" })).toEqual(["boss@acme.test"]);
  });

  it("sends nothing when lead alerts are off or no inbox is valid", () => {
    expect(escalationRecipients({ owner_email: "boss@acme.test", notify_on_lead: false })).toEqual([]);
    expect(escalationRecipients({})).toEqual([]);
  });
});
