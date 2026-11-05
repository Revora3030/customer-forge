import { describe, expect, it } from "vitest";
import { buildOpsSpanPayload, cleanOpsAttributes, errorTypeOf, opsLogRecord, safeOpsLabel, traceIdFor } from "./ops-trace";

const JOB = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

class NoProgressError extends Error {}
class RevoraAiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

describe("BRF-03 ops traces (pure)", () => {
  it("names an error by class (and status), never by its message", () => {
    expect(errorTypeOf(new NoProgressError("owner@acme.com said https://x.y/secret"))).toBe("NoProgressError");
    expect(errorTypeOf(new RevoraAiError("rate limited", 429))).toBe("RevoraAiError:429");
    expect(errorTypeOf("boom")).toBe("UnknownError");
    expect(errorTypeOf({ name: "has spaces and words" })).toBe("Error");
  });

  it("keeps only allowlisted, short, label-shaped attributes", () => {
    expect(
      cleanOpsAttributes({
        "revora.stage": "pages",
        "revora.attempt": 2.4,
        "revora.live_edit": true,
        "revora.failure_kind": "The AI said: owner@acme.com",
        ...({ "org.id": "x", prompt: "make me a site" } as object),
      }),
    ).toEqual({ "revora.stage": "pages", "revora.attempt": 2, "revora.live_edit": true });
    expect(safeOpsLabel("https://example.com")).toBeNull();
  });

  it("uses the job id as the trace id so every attempt of a build lines up", () => {
    expect(traceIdFor(JOB)).toBe(JOB.replace(/-/g, ""));
    expect(traceIdFor("not-a-uuid")).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIdFor("00000000-0000-0000-0000-000000000000")).not.toMatch(/^0+$/);
  });

  it("builds one OTLP span: error status for failures, unset for a gate refusal", () => {
    const failed = buildOpsSpanPayload({ name: "site.generate", traceKey: JOB, startedAtMs: 1_000, endedAtMs: 4_000, outcome: "failed", errorType: "NoProgressError", attributes: { "revora.stage": "pages" } }, "production");
    const span = failed.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(span.name).toBe("site.generate");
    expect(span.traceId).toBe(JOB.replace(/-/g, ""));
    expect(span.status).toEqual({ code: 2, message: "NoProgressError" });
    expect(span.startTimeUnixNano).toBe("1000000000");
    expect(span.endTimeUnixNano).toBe("4000000000");
    expect(span.attributes).toContainEqual({ key: "error.type", value: { stringValue: "NoProgressError" } });
    expect(span.attributes).toContainEqual({ key: "revora.stage", value: { stringValue: "pages" } });
    const blocked = buildOpsSpanPayload({ name: "site.deploy", traceKey: "x", startedAtMs: 0, endedAtMs: 1, outcome: "blocked" });
    expect(blocked.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.status).toEqual({ code: 0 });
    const json = JSON.stringify(failed);
    expect(json).not.toMatch(/organization|user_id|@/);
  });

  it("writes a compact log record", () => {
    expect(opsLogRecord({ name: "site.deploy.smoke", traceKey: JOB, startedAtMs: 10, endedAtMs: 260, outcome: "ok", attributes: { "revora.smoke.checks": 3 } })).toEqual({
      trace: "site.deploy.smoke",
      traceId: JOB.replace(/-/g, ""),
      outcome: "ok",
      ms: 250,
      "revora.smoke.checks": 3,
    });
  });
});
