import { describe, expect, it } from "vitest";
import { buildStepStatuses } from "./build-step-status";
import { resumeOrRunStage } from "./resume-stage";
import { jobStageCheckpointStore } from "./job-stage-checkpoints";

const KEYS = ["business", "analysis", "brand", "pictures", "wording", "layout", "checks", "ready"];

describe("buildStepStatuses", () => {
  it("marks finished, running and pending steps of a live build", () => {
    const r = buildStepStatuses(KEYS, { status: "processing", currentStep: "analysis" });
    expect(r.steps.map((s) => s.status)).toEqual(["done", "done", "running", "pending", "pending", "pending", "pending", "pending"]);
    expect(r.failedStep).toBeNull();
  });
  it("names the failed step and lists the saved work a retry will reuse", () => {
    const r = buildStepStatuses(KEYS, { status: "failed", currentStep: "brand", failedStage: "pictures", checkpointKeys: ["brief", "refined", "pictures"] });
    expect(r.failedStep).toBe("pictures");
    expect(r.steps.find((s) => s.key === "pictures")).toEqual({ key: "pictures", status: "failed", checkpoints: ["refined", "pictures"] });
    expect(r.steps.find((s) => s.key === "brand")?.status).toBe("done");
    expect(r.steps.find((s) => s.key === "wording")?.status).toBe("pending");
    expect(r.resumable).toBe(true);
  });
  it("shows a capacity wait as waiting, not failed", () => {
    const r = buildStepStatuses(KEYS, { status: "waiting", currentStep: "brand", failedStage: "pictures" });
    expect(r.steps.find((s) => s.key === "pictures")?.status).toBe("waiting");
  });
  it("completed builds are all done and not resumable", () => {
    const r = buildStepStatuses(KEYS, { status: "completed", currentStep: "ready", checkpointKeys: ["brief"] });
    expect(r.steps.every((s) => s.status === "done")).toBe(true);
    expect(r.resumable).toBe(false);
  });
  it("copes with an unknown current step", () => {
    const r = buildStepStatuses(KEYS, { status: "queued", currentStep: null });
    expect(r.steps[0]?.status).toBe("pending");
  });
});

function memoryStore() {
  const db = { stage: null as Record<string, { digest: string; value: unknown }> | null };
  // Minimal in-memory checkpoint store with the same digest rule as the real one.
  const digest = (v: unknown) => JSON.stringify(v);
  return {
    async get<T>(key: string, inputs: unknown) {
      const e = db.stage?.[key];
      return e && e.digest === digest(inputs) ? (e.value as T) : null;
    },
    async put(key: string, inputs: unknown, value: unknown) {
      db.stage = { ...(db.stage ?? {}), [key]: { digest: digest(inputs), value } };
      return true;
    },
  };
}

describe("resumeOrRunStage", () => {
  it("runs once for the same inputs and reuses the saved result on retry", async () => {
    const store = memoryStore();
    let runs = 0;
    const run = async () => (runs++, { value: { ok: true }, complete: true });
    const first = await resumeOrRunStage(store, "qa-repair", { sections: 12 }, run);
    const retry = await resumeOrRunStage(store, "qa-repair", { sections: 12 }, run);
    expect([first.resumed, retry.resumed, runs]).toEqual([false, true, 1]);
  });
  it("runs again when the inputs changed", async () => {
    const store = memoryStore();
    let runs = 0;
    const run = async () => (runs++, { value: 1, complete: true });
    await resumeOrRunStage(store, "qa-repair", { sections: 12 }, run);
    await resumeOrRunStage(store, "qa-repair", { sections: 13 }, run);
    expect(runs).toBe(2);
  });
  it("does not save a stage that only partly worked", async () => {
    const store = memoryStore();
    let runs = 0;
    const run = async () => (runs++, { value: 1, complete: false });
    const a = await resumeOrRunStage(store, "qa-repair", {}, run);
    await resumeOrRunStage(store, "qa-repair", {}, run);
    expect([a.saved, runs]).toEqual([false, 2]);
  });
  it("runs without a store", async () => {
    const r = await resumeOrRunStage(null, "x", {}, async () => ({ value: 7, complete: true }));
    expect(r).toEqual({ value: 7, resumed: false, saved: false });
  });
});

describe("resume proof with the real job store", () => {
  it("a retried job (attempt 2) reuses every stage the first attempt saved, and none whose inputs changed", async () => {
    const row: Record<string, unknown> = { id: "job-9", organization_id: "org-1", attempts: 1, status: "processing", stage_checkpoints: null };
    const db = {
      from() {
        const f: [string, unknown][] = [];
        let patch: Record<string, unknown> | null = null;
        const ok = () => f.every(([k, v]) => row[k] === v);
        const q: Record<string, unknown> = {
          select: () => q,
          update: (v: Record<string, unknown>) => ((patch = v), q),
          eq: (k: string, v: unknown) => {
            f.push([k, v]);
            if (patch && f.length >= 4) {
              if (ok()) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            }
            return q;
          },
          maybeSingle: () => Promise.resolve({ data: ok() ? row : null, error: null }),
        };
        return q;
      },
    };
    const stages = ["brief", "identity", "refined", "architecture", "pictures", "wording", "qa-repair"];
    const first = jobStageCheckpointStore(db, { jobId: "job-9", organizationId: "org-1", attempts: 1 });
    for (const s of stages) expect(await first.put(s, { s, v: 1 }, { done: s })).toBe(true);
    row["attempts"] = 2;
    const retry = jobStageCheckpointStore(db, { jobId: "job-9", organizationId: "org-1", attempts: 2 });
    for (const s of stages) expect(await retry.get(s, { s, v: 1 })).toEqual({ done: s });
    for (const s of stages) expect(await retry.get(s, { s, v: 2 })).toBeNull();
  });
});
