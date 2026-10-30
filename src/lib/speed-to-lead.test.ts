import { describe, expect, it } from "vitest";
import { RESPONSE_KINDS, computeSpeedToLead, formatWait } from "./speed-to-lead";

const NOW = new Date("2026-10-27T12:00:00Z");
const at = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60_000).toISOString();

describe("computeSpeedToLead", () => {
  it("reports nothing when there are no leads", () => {
    const r = computeSpeedToLead([], [], NOW);
    expect(r.leadCount).toBe(0);
    expect(r.medianMinutes).toBeNull();
    expect(r.withinGoalPct).toBeNull();
  });

  it("measures minutes from arrival to the first call, email or text", () => {
    const r = computeSpeedToLead(
      [{ id: "a", created_at: at(100) }, { id: "b", created_at: at(90) }, { id: "c", created_at: at(80) }],
      [
        { lead_id: "a", kind: "call", created_at: at(98) }, // 2 min
        { lead_id: "b", kind: "email", created_at: at(70) }, // 20 min
        { lead_id: "c", kind: "text", created_at: at(77) }, // 3 min
        { lead_id: "c", kind: "call", created_at: at(10) }, // later contact ignored
      ],
      NOW,
    );
    expect(r.answered).toBe(3);
    expect(r.medianMinutes).toBe(3);
    expect(r.withinGoalPct).toBe(67);
  });

  it("does not count notes, inquiries or status changes as a response", () => {
    const r = computeSpeedToLead(
      [{ id: "a", created_at: at(60) }],
      ["note", "inquiry", "status", "assign", "converted"].map((kind) => ({ lead_id: "a", kind, created_at: at(55) })),
      NOW,
    );
    expect(RESPONSE_KINDS).toEqual(["call", "email", "text"]);
    expect(r.answered).toBe(0);
    expect(r.missed).toBe(1);
  });

  it("ignores contact dated before the lead arrived", () => {
    const r = computeSpeedToLead(
      [{ id: "a", created_at: at(30) }],
      [{ lead_id: "a", kind: "call", created_at: at(45) }],
      NOW,
    );
    expect(r.answered).toBe(0);
  });

  it("gives a brand-new unanswered lead grace instead of calling it a miss", () => {
    const r = computeSpeedToLead([{ id: "a", created_at: at(2) }], [], NOW);
    expect(r.withinGrace).toBe(1);
    expect(r.missed).toBe(0);
    expect(r.withinGoalPct).toBeNull();
  });

  it("lists the longest-waiting unanswered leads first and caps at five", () => {
    const leads = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, created_at: at(10 + i * 10) }));
    const r = computeSpeedToLead(leads, [], NOW);
    expect(r.waiting).toHaveLength(5);
    expect(r.waiting[0]!.id).toBe("l6");
    expect(r.waiting[0]!.minutes).toBe(70);
  });

  it("leaves out leads older than the window and bad dates", () => {
    const r = computeSpeedToLead(
      [{ id: "old", created_at: at(60 * 24 * 40) }, { id: "bad", created_at: "nope" }, { id: "ok", created_at: at(20) }],
      [],
      NOW,
    );
    expect(r.leadCount).toBe(1);
  });

  it("formats waits compactly", () => {
    expect(formatWait(0.2)).toBe("under a minute");
    expect(formatWait(7)).toBe("7 min");
    expect(formatWait(130)).toBe("2 h 10 min");
    expect(formatWait(60 * 28)).toBe("1 d 4 h");
  });
});
