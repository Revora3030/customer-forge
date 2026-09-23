import { beforeEach, describe, expect, it } from "vitest";

import {
  FORM_MEMORY_MS,
  SLOW_LATENCY_MS,
  freeModelForm,
  freeModelFormSnapshot,
  recordFreeModelOutcome,
  resetFreeModelForm,
} from "@/lib/ai/free-reputation";
import { rankHallOfFame, type HallOfFameCandidate } from "@/lib/ai/hall-of-fame";

const candidate = (
  provider: string,
  model: string,
  weight: number,
  extra: Partial<HallOfFameCandidate> = {},
): HallOfFameCandidate => ({
  provider,
  model,
  capabilities: ["design"],
  weight,
  healthy: true,
  remainingToday: null,
  ...extra,
});

describe("free-model form", () => {
  beforeEach(() => resetFreeModelForm());

  it("treats an unproven model as neutral", () => {
    expect(freeModelForm("groq", "unknown")).toEqual({
      attempts: 0,
      wins: 0,
      averageLatencyMs: null,
      score: 0,
    });
  });

  it("rewards a model that keeps delivering", () => {
    for (let i = 0; i < 4; i += 1)
      recordFreeModelOutcome({ provider: "groq", model: "good", ok: true, latencyMs: 900 });
    const form = freeModelForm("groq", "good");
    expect(form.wins).toBe(4);
    expect(form.score).toBeGreaterThan(0.8);
  });

  it("punishes a model that keeps failing", () => {
    for (let i = 0; i < 4; i += 1)
      recordFreeModelOutcome({ provider: "llm7", model: "bad", ok: false, latencyMs: 400 });
    expect(freeModelForm("llm7", "bad").score).toBeLessThan(-0.8);
  });

  it("trusts a recovered model again", () => {
    recordFreeModelOutcome({ provider: "groq", model: "back", ok: false });
    recordFreeModelOutcome({ provider: "groq", model: "back", ok: false });
    recordFreeModelOutcome({ provider: "groq", model: "back", ok: true });
    recordFreeModelOutcome({ provider: "groq", model: "back", ok: true });
    recordFreeModelOutcome({ provider: "groq", model: "back", ok: true });
    expect(freeModelForm("groq", "back").score).toBeGreaterThan(0);
  });

  it("forgets outcomes older than the memory window", () => {
    const old = Date.now() - FORM_MEMORY_MS - 1_000;
    recordFreeModelOutcome({ provider: "groq", model: "stale", ok: false, at: old });
    expect(freeModelForm("groq", "stale").attempts).toBe(0);
  });

  it("nudges a slow but working model below a fast one", () => {
    for (let i = 0; i < 3; i += 1) {
      recordFreeModelOutcome({ provider: "a", model: "fast", ok: true, latencyMs: 500 });
      recordFreeModelOutcome({
        provider: "b",
        model: "slow",
        ok: true,
        latencyMs: SLOW_LATENCY_MS + 1_000,
      });
    }
    expect(freeModelForm("a", "fast").score).toBeGreaterThan(freeModelForm("b", "slow").score);
  });

  it("reports a snapshot without any prompt content", () => {
    recordFreeModelOutcome({ provider: "groq", model: "seen", ok: true, latencyMs: 700 });
    const snapshot = freeModelFormSnapshot();
    expect(snapshot[0]).toMatchObject({ provider: "groq", model: "seen", attempts: 1, wins: 1 });
  });
});

describe("form-aware squad ranking", () => {
  beforeEach(() => resetFreeModelForm());

  it("moves a proven model ahead of a slightly stronger failing one", () => {
    for (let i = 0; i < 4; i += 1) {
      recordFreeModelOutcome({ provider: "groq", model: "failing", ok: false });
      recordFreeModelOutcome({ provider: "nvidia", model: "proven", ok: true, latencyMs: 800 });
    }
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [candidate("groq", "failing", 90), candidate("nvidia", "proven", 75)],
      form: (entry) => freeModelForm(entry.provider, entry.model).score,
    });
    expect(squad[0]?.model).toBe("proven");
  });

  it("never promotes a model that is not ready, however good its form", () => {
    for (let i = 0; i < 5; i += 1)
      recordFreeModelOutcome({ provider: "groq", model: "spent", ok: true, latencyMs: 500 });
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "spent", 95, { remainingToday: 0 }),
        candidate("nvidia", "ready", 50),
      ],
      form: (entry) => freeModelForm(entry.provider, entry.model).score,
    });
    expect(squad[0]?.model).toBe("ready");
  });

  it("keeps strength order when nothing has been proven yet", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [candidate("groq", "small", 40), candidate("groq", "huge", 95)],
      form: (entry) => freeModelForm(entry.provider, entry.model).score,
    });
    expect(squad.map((entry) => entry.model)).toEqual(["huge", "small"]);
  });
});
