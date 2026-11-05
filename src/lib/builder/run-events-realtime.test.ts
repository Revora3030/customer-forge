import { describe, expect, it } from "vitest";
import { pollInterval, REALTIME_SAFETY_POLL_MS, RUN_EVENTS_REALTIME } from "./run-events-realtime";

describe("RUN_EVENTS_REALTIME (JC-32)", () => {
  it("points at jarvis_run_events filtered by run_id", () => {
    expect(RUN_EVENTS_REALTIME).toEqual({ table: "jarvis_run_events", filterColumn: "run_id" });
  });

  it("uses the base poll when disconnected (or source null) and the safety poll when connected", () => {
    expect(pollInterval(2000, false)).toBe(2000);
    expect(pollInterval(2500, false)).toBe(2500);
    expect(pollInterval(2000, true)).toBe(REALTIME_SAFETY_POLL_MS);
    expect(pollInterval(20_000, true)).toBe(20_000);
  });
});
