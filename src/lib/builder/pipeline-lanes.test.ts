import { describe, expect, it } from "vitest";
import { buildLanes, elapsedLabel, handoffsFor, retryDraft, type LaneJob, type Tier } from "./pipeline-lanes";

const NOW = Date.parse("2026-11-04T20:00:00Z");
const STEPS = [{ key: "business", label: "Business analysed" }, { key: "brand", label: "Brand prepared" }, { key: "pictures", label: "Pictures" }, { key: "checks", label: "Checks" }];
const TIERS: Record<string, Tier> = { "gpt-6-sol": "sol", "gpt-5.6-terra": "terra", "gpt-6-luna": "luna" };
const tierOf = (m: string) => TIERS[m] ?? null;
const job = (over: Partial<LaneJob>): LaneJob => ({
  id: "j1", organization_id: "o1", status: "processing", current_step: "business", failed_stage: null, failure_kind: null, wait_reason: null, resumes_at: null,
  started_at: "2026-11-04T19:30:00Z", created_at: "2026-11-04T19:29:00Z", updated_at: "2026-11-04T19:59:30Z", lease_expires_at: "2026-11-04T20:05:00Z", attempts: 1, stage_checkpoints: null, ...over,
});
const base = { names: new Map([["o1", "Acme Plumbing"]]), steps: STEPS, tierOfModel: tierOf, success: null, now: NOW };

describe("buildLanes", () => {
  it("shows the stage, elapsed time and recorded handoffs of a running job", () => {
    const b = buildLanes({ ...base, jobs: [job({})], trace: [
      { organization_id: "o1", model: "gpt-6-sol", stage: "brand", created_at: "2026-11-04T19:31:00Z" },
      { organization_id: "o1", model: "gpt-6-sol", stage: "brand", created_at: "2026-11-04T19:32:00Z" },
      { organization_id: "o1", model: "gpt-5.6-terra", stage: "review", created_at: "2026-11-04T19:40:00Z" },
      { organization_id: "o1", model: "some-other-model", stage: "x", created_at: "2026-11-04T19:41:00Z" },
      { organization_id: "o1", model: "gpt-6-luna", stage: "facts", created_at: "2026-11-04T19:20:00Z" }, // before the job started
      { organization_id: "o2", model: "gpt-6-luna", stage: "facts", created_at: "2026-11-04T19:45:00Z" }, // other workspace
    ] });
    const lane = b.lanes[0]!;
    expect(lane.name).toBe("Acme Plumbing");
    expect(lane.stage).toEqual({ key: "brand", label: "Brand prepared", number: 2, total: 4 });
    expect(lane.elapsedMs).toBe(30 * 60_000);
    expect(lane.handoffs.map((h) => h.tier)).toEqual(["sol", "terra"]);
    expect(lane.otherCalls).toBe(1);
    expect(lane.retry).toBeNull();
  });

  it("offers Retry only for a stopped build with saved checkpoints", () => {
    const stopped = job({ status: "failed", current_step: "brand", failed_stage: "pictures", failure_kind: "timeout", stage_checkpoints: { identity: {}, brief: {} } });
    const noSave = job({ id: "j2", status: "failed", failed_stage: "pictures", stage_checkpoints: {} });
    const running = job({ id: "j3", stage_checkpoints: { identity: {} } });
    const [a, b, c] = buildLanes({ ...base, jobs: [stopped, noSave, running], trace: [] }).lanes;
    expect(a?.retry).toEqual({ step: "pictures", label: "Pictures", checkpoints: ["identity", "brief"] });
    expect(a?.failureKind).toBe("timeout");
    expect(b?.retry).toBeNull();
    expect(c?.retry).toBeNull();
    expect(retryDraft(a!)).toContain("do not start a paid build without my explicit approval");
  });

  it("uses the stored wait reason and queue time, never a guess", () => {
    const [w, q] = buildLanes({ ...base, jobs: [
      job({ status: "waiting", failed_stage: "pictures", wait_reason: "Image provider busy", resumes_at: "2026-11-04T20:10:00Z" }),
      job({ id: "q", status: "queued", current_step: null, started_at: null, created_at: "2026-11-04T19:50:00Z" }),
    ], trace: null }).lanes;
    expect(w?.waitReason).toBe("Image provider busy");
    expect(w?.stage?.key).toBe("pictures");
    expect(q?.stage).toBeNull();
    expect(q?.elapsedFrom).toBe("queued");
    expect(q?.elapsedMs).toBe(10 * 60_000);
  });

  it("flags a processing job whose lease lapsed as stalled", () => {
    const lane = buildLanes({ ...base, jobs: [job({ lease_expires_at: "2026-11-04T19:00:00Z", updated_at: "2026-11-04T19:00:00Z" })], trace: [] }).lanes[0]!;
    expect(lane.stalled).toBe(true);
  });

  it("reports unreadable jobs and trace separately", () => {
    const b = buildLanes({ ...base, jobs: null, trace: null });
    expect(b.jobsAvailable).toBe(false);
    expect(b.traceAvailable).toBe(false);
    expect(b.lanes).toEqual([]);
  });
});

describe("helpers", () => {
  it("collapses consecutive calls by one tier", () => {
    expect(handoffsFor([], tierOf)).toEqual({ handoffs: [], otherCalls: 0 });
  });
  it("labels elapsed time", () => {
    expect(elapsedLabel(null)).toBe("time not recorded");
    expect(elapsedLabel(30_000)).toBe("under 1m");
    expect(elapsedLabel(95 * 60_000)).toBe("1h 35m");
  });
});
