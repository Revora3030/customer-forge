import { describe, expect, it } from "vitest";
import { capacityWaitDetail, capacityWaitHeadline, capacityWaitState, summarizeCapacityPressure } from "./capacity-wait";
import { rescueShouldPark } from "./first-build-compositions.server";
import { capacityVerdict, MAX_CAPACITY_DEFERRALS } from "../site-engine.worker.server";
import { jobStageCheckpointStore } from "./job-stage-checkpoints";

const NOW = Date.parse("2026-10-20T10:00:00Z");

describe("resume-time display data", () => {
  const job = {
    status: "queued",
    resumes_at: "2026-10-20T10:15:00Z",
    wait_reason: "The free AI team is at capacity right now (9 of 12 AI calls were rate-limited or timed out).",
    wait_providers: { providers: ["groq", "cerebras"], earliestResetAt: "2026-10-20T10:12:00Z" },
  };

  it("shows the resume time, reason, busy providers and earliest reset", () => {
    const state = capacityWaitState(job, NOW)!;
    expect(state.resumesAt).toBe("2026-10-20T10:15:00.000Z");
    expect(state.providers).toEqual(["groq", "cerebras"]);
    expect(capacityWaitHeadline(state, "en-GB", "UTC")).toBe("Waiting for AI capacity — resumes about 10:15");
    const detail = capacityWaitDetail(state, "en-GB", "UTC");
    expect(detail).toContain("Busy or out of quota: groq, cerebras.");
    expect(detail).toContain("Earliest provider reset: about 10:12.");
  });

  it("hides once the resume time has passed or the job is running", () => {
    expect(capacityWaitState(job, Date.parse("2026-10-20T10:16:00Z"))).toBeNull();
    expect(capacityWaitState({ ...job, status: "processing" }, NOW)).toBeNull();
  });

  it("derives from the existing deferral columns when the mirror is absent", () => {
    const state = capacityWaitState(
      { status: "queued", lease_expires_at: "2026-10-20T10:30:00Z", capacity_deferrals: 2, failure_kind: "provider" },
      NOW,
    );
    expect(state?.resumesAt).toBe("2026-10-20T10:30:00.000Z");
    expect(capacityWaitState({ status: "queued", lease_expires_at: "2026-10-20T10:30:00Z", capacity_deferrals: 0 }, NOW)).toBeNull();
  });

  it("lists pressured providers and only future resets", () => {
    const pressure = summarizeCapacityPressure(
      [
        { ok: false, error_category: "rate_limited", provider: "groq" },
        { ok: false, error_category: "quota", provider: "mistral" },
        { ok: false, error_category: "bad_response", provider: "openrouter" },
        { ok: true, error_category: null, provider: "cerebras" },
      ],
      [
        { provider: "groq", open_until: "2026-10-20T10:20:00Z" },
        { provider: "mistral", open_until: "2026-10-20T09:00:00Z" },
      ],
      NOW,
    );
    expect(pressure).toEqual({ providers: ["groq", "mistral"], earliestResetAt: "2026-10-20T10:20:00.000Z" });
  });
});

describe("rescue deadline → capacity deferral", () => {
  it("parks when the rescue deadline ran out with sections missing", () => {
    expect(rescueShouldPark({ missing: 3, deadlineHit: true, calls: 2, unavailable: 0 })).toBe(true);
    expect(rescueShouldPark({ missing: 2, deadlineHit: false, calls: 4, unavailable: 3 })).toBe(true);
  });

  it("still fails on validator rejections or when nothing is missing", () => {
    expect(rescueShouldPark({ missing: 2, deadlineHit: false, calls: 4, unavailable: 0 })).toBe(false);
    expect(rescueShouldPark({ missing: 0, deadlineHit: true, calls: 4, unavailable: 4 })).toBe(false);
  });

  it("a forced park defers without the call-ratio threshold, capped by the maximum", () => {
    const verdict = capacityVerdict([], 0, NOW, { forced: true });
    expect(verdict?.retryAt.toISOString()).toBe("2026-10-20T10:15:00.000Z");
    expect(verdict?.summary).toBe("the AI team ran out of time to finish this step");
    expect(capacityVerdict([], MAX_CAPACITY_DEFERRALS, NOW, { forced: true })).toBeNull();
    expect(capacityVerdict([], 0, NOW)).toBeNull();
  });

  it("resumes at the earliest known provider reset when sooner (never under 5 min)", () => {
    const calls = Array(6).fill({ ok: false, error_category: "rate_limited", provider: "groq" });
    const soon = capacityVerdict(calls, 0, NOW, { runtime: [{ provider: "groq", open_until: "2026-10-20T10:08:00Z" }] });
    expect(soon?.retryAt.toISOString()).toBe("2026-10-20T10:08:00.000Z");
    const tooSoon = capacityVerdict(calls, 0, NOW, { runtime: [{ provider: "groq", open_until: "2026-10-20T10:01:00Z" }] });
    expect(tooSoon?.retryAt.toISOString()).toBe("2026-10-20T10:05:00.000Z");
  });
});

/** Minimal fake of the generation_jobs row with filter checks. */
function fakeDb(row: { id: string; organization_id: string; attempts: number; status: string; stage_checkpoints: unknown }) {
  return {
    from() {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const matches = () => Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (value: Record<string, unknown>) => ((patch = value), chain),
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) => resolve(apply()),
        maybeSingle: async () => ({ data: matches() ? { stage_checkpoints: row.stage_checkpoints } : null, error: null }),
      };
      const apply = () => {
        if (patch && matches()) Object.assign(row, patch);
        return { error: null };
      };
      return chain;
    },
  };
}

describe("stage-output reuse across retries of the same job", () => {
  it("a retry (next attempt) reuses the brief; changed owner inputs discard it", async () => {
    const row = { id: "job-1", organization_id: "org-1", attempts: 1, status: "processing", stage_checkpoints: null };
    const first = jobStageCheckpointStore(fakeDb(row) as never, { jobId: "job-1", organizationId: "org-1", attempts: 1 });
    await first.put("brief", { name: "Shined Up" }, { concept: "Gloss" });
    expect(row.stage_checkpoints).not.toBeNull();

    row.attempts = 2; // deferral / lease recovery hands the same job to a new attempt
    const retry = jobStageCheckpointStore(fakeDb(row) as never, { jobId: "job-1", organizationId: "org-1", attempts: 2 });
    expect(await retry.get("brief", { name: "Shined Up" })).toEqual({ concept: "Gloss" });
    expect(await retry.get("brief", { name: "Shined Up Detailing" })).toBeNull();
  });

  it("attempt fencing: a superseded attempt cannot overwrite checkpoints", async () => {
    const row = { id: "job-1", organization_id: "org-1", attempts: 3, status: "processing", stage_checkpoints: null };
    const stale = jobStageCheckpointStore(fakeDb(row) as never, { jobId: "job-1", organizationId: "org-1", attempts: 2 });
    await stale.put("brief", { name: "x" }, { concept: "stale" });
    expect(row.stage_checkpoints).toBeNull();
  });
});
