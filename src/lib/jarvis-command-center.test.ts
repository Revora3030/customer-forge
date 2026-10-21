import { describe, expect, it } from "vitest";
import { classifyProviders, configuredProviders } from "./jarvis-model-status";
import { safeArtifactUrl, summarize } from "./jarvis-events";
import { createRunRecorder } from "./jarvis-events.server";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const rt = (o: Record<string, unknown> = {}) => ({ provider: "groq", day: "2026-10-21", used: 5, failures: 0, open_until: null, last_success_at: null, last_failure_at: null, last_latency_ms: 300, rate_limited_at: null, ...o });
const calls = (n: number, ok: number, provider = "groq") =>
  Array.from({ length: n }, (_, i) => ({ provider, model: "m", ok: i < ok, created_at: "2026-10-21T11:00:00Z" }));

describe("model status levels", () => {
  it("a key alone is only configured", () => {
    expect(classifyProviders({ runtime: [], trace: [], configured: { groq: true }, now: NOW })[0]!.level).toBe("configured");
  });
  it("no key is not configured even with old calls", () => {
    expect(classifyProviders({ runtime: [], trace: calls(5, 5), configured: { groq: false }, now: NOW })[0]!.level).toBe("not_configured");
  });
  it("healthy needs at least 80% success over 3+ calls", () => {
    expect(classifyProviders({ runtime: [rt()], trace: calls(5, 4), configured: { groq: true }, now: NOW })[0]!.level).toBe("healthy");
    expect(classifyProviders({ runtime: [rt()], trace: calls(5, 2), configured: { groq: true }, now: NOW })[0]!.level).toBe("degraded");
  });
  it("an open circuit is resting and a recent 429 is rate limited", () => {
    expect(classifyProviders({ runtime: [rt({ open_until: "2026-10-21T13:00:00Z" })], trace: calls(5, 5), configured: { groq: true }, now: NOW })[0]!.level).toBe("resting");
    expect(classifyProviders({ runtime: [rt({ rate_limited_at: "2026-10-21T11:50:00Z" })], trace: calls(5, 5), configured: { groq: true }, now: NOW })[0]!.level).toBe("rate_limited");
  });
  it("reports key presence as booleans only", () => {
    const c = configuredProviders({ GROQ_API_KEY: "secret-value" });
    expect(c["groq"]).toBe(true);
    expect(JSON.stringify(c)).not.toContain("secret-value");
  });
});

describe("run event redaction", () => {
  it("removes keys and tokens and bounds length", () => {
    const s = summarize("api_key=abc123 Bearer xyz.abc sk-ABCDEFGHIJKLMNOPQRSTUV " + "x".repeat(900), 500)!;
    expect(s).not.toContain("abc123");
    expect(s).not.toContain("sk-ABCDEFGHIJKLMNOP");
    expect(s.length).toBeLessThanOrEqual(500);
  });
  it("keeps only same-site paths or https artifact links", () => {
    expect(safeArtifactUrl("/admin/jarvis")).toBe("/admin/jarvis");
    expect(safeArtifactUrl("//evil.com")).toBeNull();
    expect(safeArtifactUrl("javascript:alert(1)")).toBeNull();
  });
  it("records durations and never throws when saving fails", async () => {
    const r = createRunRecorder("u");
    r.add({ step: 0, kind: "tool", status: "ok", startedAt: 1000, finishedAt: 1250 });
    const inserted: unknown[] = [];
    const db = { from: () => ({ insert: async (rows: unknown[]) => { inserted.push(...rows); return { error: { message: "down" } }; } }) };
    await r.flush(db as never, "m1");
    expect(inserted[0]).toMatchObject({ duration_ms: 250, message_id: "m1", run_id: r.runId });
  });
});
