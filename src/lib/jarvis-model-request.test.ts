import { describe, expect, it } from "vitest";
import { jarvisModelRequest } from "./jarvis-model-request.server";
import { JARVIS_ATTEMPT_TIMEOUT_MS, JARVIS_CHAIN_DEADLINE_MS, JARVIS_TURN_DEADLINE_MS } from "./jarvis-turn-deadline";

describe("admin Jarvis model access", () => {
  it("does not restrict conversation work to the free-only lane", () => {
    const request = jarvisModelRequest([{ role: "user", content: "Build a site" }], 3500);
    expect(request).not.toHaveProperty("freeOnly");
    expect(request.role).toBe("conversation");
    expect(request.maxOutputTokens).toBe(3500);
  });

  it("sets an attempt timeout and a chain deadline that fit inside one turn", () => {
    const request = jarvisModelRequest([{ role: "user", content: "Status?" }], 1200);
    expect(request.timeoutMs).toBe(JARVIS_ATTEMPT_TIMEOUT_MS);
    expect(request.chainDeadlineMs).toBe(JARVIS_CHAIN_DEADLINE_MS);
    expect(JARVIS_ATTEMPT_TIMEOUT_MS).toBeLessThanOrEqual(JARVIS_CHAIN_DEADLINE_MS);
    expect(JARVIS_CHAIN_DEADLINE_MS).toBeLessThanOrEqual(JARVIS_TURN_DEADLINE_MS);
    expect(JARVIS_TURN_DEADLINE_MS).toBeGreaterThanOrEqual(90_000);
    expect(JARVIS_TURN_DEADLINE_MS).toBeLessThanOrEqual(120_000);
  });

  it("caps a round by what is left of the turn, never raising the limits", () => {
    expect(jarvisModelRequest([], 800, null, { timeoutMs: 12_000, chainDeadlineMs: 12_000 })).toMatchObject({ timeoutMs: 12_000, chainDeadlineMs: 12_000 });
    expect(jarvisModelRequest([], 800, null, { timeoutMs: 999_000, chainDeadlineMs: 999_000 })).toMatchObject({ timeoutMs: JARVIS_ATTEMPT_TIMEOUT_MS, chainDeadlineMs: JARVIS_CHAIN_DEADLINE_MS });
  });

  it("keeps a picked model as the lead", () => {
    expect(jarvisModelRequest([], 800, "google/gemini-3.8-flash").preferModels).toEqual(["google/gemini-3.8-flash"]);
  });
});
