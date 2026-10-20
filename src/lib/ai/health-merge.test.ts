import { describe, expect, it } from "vitest";
import { lastRecordedOutcome, mergeProviderHealth } from "./health-merge";

const NOW = Date.parse("2026-10-20T16:00:00Z");
const idle = { name: "groq", healthy: true, openFailures: 0, cooldownUntil: null, remainingToday: 1000 };
const call = (provider: string, ok: boolean, at = "2026-10-20T15:00:00Z") => ({
  created_at: at, provider, model: "m", task: "t", ok, error_category: ok ? null : "rate_limited", fallback_used: false,
});

describe("admin AI health uses shared records, not one idle worker", () => {
  it("shows a provider resting when the shared circuit is open", () => {
    const [groq] = mergeProviderHealth([idle], [{ provider: "groq", day: "2026-10-20", used: 10, failures: 7, openUntil: NOW + 600_000 }], { groq: 1000 }, [], NOW);
    expect(groq?.healthy).toBe(false);
    expect(groq?.cooldownUntil).toBe(NOW + 600_000);
    expect(groq?.openFailures).toBe(7);
  });

  it("uses the shared daily allowance and reports out of quota", () => {
    const [groq] = mergeProviderHealth([idle], [{ provider: "groq", day: "2026-10-20", used: 1000, failures: 0, openUntil: null }], { groq: 1000 }, [], NOW);
    expect(groq?.remainingToday).toBe(0);
    expect(groq?.healthy).toBe(false);
  });

  it("ignores yesterday's shared counters and counts real 24h calls", () => {
    const [groq] = mergeProviderHealth(
      [idle],
      [{ provider: "groq", day: "2026-10-19", used: 1000, failures: 50, openUntil: null }],
      { groq: 1000 },
      [call("groq", false), call("groq", true), call("groq", false, "2026-10-18T10:00:00Z"), call("cerebras", false)],
      NOW,
    );
    expect(groq?.remainingToday).toBe(1000);
    expect(groq?.healthy).toBe(true);
    expect(groq?.calls24h).toBe(2);
    expect(groq?.failures24h).toBe(1);
  });

  it("reports the newest recorded call as the last request", () => {
    const last = lastRecordedOutcome([call("openai", true), call("groq", false)], new Set(["groq"]));
    expect(last).toMatchObject({ provider: "openai", ok: true, free: false });
    expect(lastRecordedOutcome([], new Set())).toBeNull();
  });
});
