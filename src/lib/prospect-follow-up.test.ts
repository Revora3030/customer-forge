import { describe, expect, it } from "vitest";
import { followUpDue } from "./prospect-follow-up";

const now = new Date("2026-10-20T12:00:00Z");
const base = { followUpSent: false, replied: false, claimed: false, now };
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("one follow-up email", () => {
  it("waits 48 hours after the first email", () => {
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(47) })).toBe(false);
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(48) })).toBe(true);
  });
  it("is sent only once", () => {
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(60), followUpSent: true })).toBe(false);
  });
  it("is never sent after a reply or a claim", () => {
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(60), replied: true })).toBe(false);
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(60), claimed: true })).toBe(false);
  });
  it("is not sent after 14 days", () => {
    expect(followUpDue({ ...base, firstSentAt: hoursAgo(15 * 24) })).toBe(false);
  });
});
