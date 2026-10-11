import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAiEvent, recordTeamStep, type AiEvent, type TeamStep } from "./telemetry.server";

const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: db.from } }));

const event: AiEvent = {
  requestId: "test-request", provider: "groq", model: "test-model", task: "copy",
  organizationId: null, userId: null, latencyMs: 12, ok: true, errorCategory: null,
  inputTokens: null, outputTokens: null, fallbackUsed: false, toolCalls: 0,
};
const step: TeamStep = {
  organizationId: null, stage: "review", purpose: "qa", lane: "free",
  model: "groq · test-model", ok: true, latencyMs: 12, reason: null,
  contribution: null, costMicrocents: 0,
};
const writers = [
  { table: "ai_usage_events", write: () => recordAiEvent(event) },
  { table: "ai_team_trace", write: () => recordTeamStep(step) },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue({ insert: db.insert });
  db.insert.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe.each(writers)("telemetry write to $table", ({ table, write }) => {
  it("records a successful insert without reporting a failure", async () => {
    await expect(write()).resolves.toBeUndefined();
    expect(db.from).toHaveBeenCalledWith(table);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });
  it("reports returned database errors without breaking the caller", async () => {
    db.insert.mockResolvedValue({ error: { code: "42501", message: "sensitive row details", details: "private payload" } });
    await expect(write()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[revora-ai] telemetry write failed", { table, code: "42501" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private payload");
  });
  it("reports rejected promises without exposing their message", async () => {
    db.insert.mockRejectedValue(new Error("secret-bearing transport failure"));
    await expect(write()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[revora-ai] telemetry write failed", { table, code: "unknown" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-bearing");
  });
  it("does not log arbitrary strings supplied as error codes", async () => {
    db.insert.mockResolvedValue({ error: { code: "token=private-value" } });
    await expect(write()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[revora-ai] telemetry write failed", { table, code: "unknown" });
  });
});
