import { describe, expect, it } from "vitest";
import { jobStageCheckpointStore } from "./job-stage-checkpoints";

/** In-memory stand-in for the job table: honours eq() filters on update/select. */
function fakeDb(row: Record<string, unknown>) {
  const matches = (filters: [string, unknown][]) => filters.every(([k, v]) => row[k] === v);
  return {
    row,
    from() {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select() { return q; },
        update(value: Record<string, unknown>) { patch = value; return q; },
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          if (patch && filters.length >= 4) {
            if (matches(filters)) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          }
          if (patch && filters.length === 2 && "stage_checkpoints" in patch && patch["stage_checkpoints"] === null) {
            if (matches(filters)) Object.assign(row, patch);
            return Object.assign(Promise.resolve({ error: null }), q);
          }
          return q;
        },
        maybeSingle() { return Promise.resolve({ data: matches(filters) ? row : null, error: null }); },
      };
      return q;
    },
  };
}

const job = { jobId: "job-1", organizationId: "org-1", attempts: 1 };

describe("stage checkpoint store (resume after interruption)", () => {
  it("a retry of the same job reuses the saved stage", async () => {
    const db = fakeDb({ id: "job-1", organization_id: "org-1", attempts: 1, status: "processing", stage_checkpoints: null });
    await jobStageCheckpointStore(db, job).put("brief", { name: "A" }, { concept: "c" });
    db.row["attempts"] = 2;
    const retry = jobStageCheckpointStore(db, { ...job, attempts: 2 });
    expect(await retry.get("brief", { name: "A" })).toEqual({ concept: "c" });
  });

  it("a superseded attempt cannot overwrite the newer attempt's checkpoint", async () => {
    const db = fakeDb({ id: "job-1", organization_id: "org-1", attempts: 2, status: "processing", stage_checkpoints: null });
    await jobStageCheckpointStore(db, { ...job, attempts: 1 }).put("brief", {}, "stale");
    expect(db.row["stage_checkpoints"]).toBeNull();
  });

  it("another workspace never reads this job's checkpoint", async () => {
    const db = fakeDb({ id: "job-1", organization_id: "org-1", attempts: 1, status: "processing", stage_checkpoints: null });
    await jobStageCheckpointStore(db, job).put("brief", {}, "mine");
    expect(await jobStageCheckpointStore(db, { ...job, organizationId: "org-2" }).get("brief", {})).toBeNull();
  });

  it("a cancelled job stops saving", async () => {
    const db = fakeDb({ id: "job-1", organization_id: "org-1", attempts: 1, status: "cancelled", stage_checkpoints: null });
    await jobStageCheckpointStore(db, job).put("brief", {}, "x");
    expect(db.row["stage_checkpoints"]).toBeNull();
  });
});
