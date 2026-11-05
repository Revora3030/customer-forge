import { describe, expect, it } from "vitest";
import type { CitySnapshot, CityWork } from "@/lib/ai-city";
import { REPLAY_SLOTS, REPLAY_SLOT_MS, frameRows, markerKind, nextSlot, replayFrame, replayMarkers, replayTruncationNote, slotOf } from "./city-replay";

const now = Date.parse("2026-11-05T12:00:00Z");
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const row = (id: string, msAgo: number, extra: Partial<CityWork> = {}): CityWork => ({ id, district: "executive", title: id, status: "ok", at: iso(msAgo), source: "jarvis_run_events", ...extra });
const snap = (rows: CityWork[], truncated = false): CitySnapshot => ({ checkedAt: iso(0), sources: { events: { available: true, rows, total: rows.length, truncated } } });

describe("city replay", () => {
  it("maps times to slots and ends at now", () => {
    expect(slotOf(now, now)).toBe(REPLAY_SLOTS - 1);
    expect(slotOf(now - REPLAY_SLOT_MS - 1, now)).toBe(REPLAY_SLOTS - 2);
    expect(slotOf(now - 49 * 3_600_000, now)).toBeNull();
    expect(slotOf(now + 1000, now)).toBeNull();
  });
  it("selects frame rows by startedAt, then at", () => {
    const a = row("a", 1000);
    const b = row("b", 1000, { startedAt: iso(5 * 3_600_000) });
    const s = snap([a, b]);
    expect(frameRows(s, REPLAY_SLOTS - 1, now).map((r) => r.id)).toEqual(["a"]);
    expect(frameRows(s, slotOf(now - 5 * 3_600_000, now)!, now).map((r) => r.id)).toEqual(["b"]);
  });
  it("derives load and health without inventing data", () => {
    const f = replayFrame(snap([row("a", 1), row("b", 2, { status: "failed" })]), REPLAY_SLOTS - 1, now);
    expect(f).toMatchObject({ load: 2, health: 0.5, isNow: true, at: now });
    expect(replayFrame(snap([]), 0, now).health).toBeNull();
  });
  it("shows truncation copy only when capped inside the window", () => {
    expect(replayTruncationNote(snap([row("a", 1000)], true), now)).toBe("History limited to what was fetched (1 rows).");
    expect(replayTruncationNote(snap([row("a", 1000)], false), now)).toBeNull();
  });
  it("classifies markers", () => {
    expect(markerKind(row("x", 1, { status: "error" }))).toBe("failure");
    expect(markerKind(row("x", 1, { source: "approval_queue", status: "pending" }))).toBe("approval");
    expect(markerKind(row("Site published", 1))).toBe("publish");
    expect(markerKind(row("CI check run", 1))).toBe("ci");
    expect(markerKind(row("plain step", 1))).toBeNull();
    expect(replayMarkers(snap([row("plain", 1), row("f", 10, { status: "failed" })]), now)).toHaveLength(1);
  });
  it("advances by speed and stops at now", () => {
    expect(nextSlot(0, 60)).toBe(60);
    expect(nextSlot(REPLAY_SLOTS - 2, 60)).toBe(REPLAY_SLOTS - 1);
  });
});
