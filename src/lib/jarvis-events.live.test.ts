import { describe, expect, it } from "vitest";
import { createRunRecorder } from "./jarvis-events.server";

function fakeDb() {
  const inserts: unknown[][] = [];
  const updates: unknown[] = [];
  const db = {
    from: () => ({
      insert: async (rows: unknown[]) => { inserts.push(rows); return { error: null }; },
      update: (patch: unknown) => { updates.push(patch); const chain = { eq: () => chain, then: (r: (v: { error: null }) => void) => r({ error: null }) }; return chain; },
    }),
  };
  return { db: db as never, inserts, updates };
}

describe("live Jarvis run steps", () => {
  it("writes each step as it is added, then links the reply", async () => {
    const { db, inserts, updates } = fakeDb();
    const runId = "11111111-2222-3333-4444-555555555555";
    const rec = createRunRecorder("u1", { db, runId });
    rec.add({ step: 1, kind: "model_call", status: "ok", startedAt: 0, finishedAt: 10 });
    rec.add({ step: 2, kind: "tool", status: "ok", startedAt: 10, finishedAt: 20 });
    await rec.flush(db, "msg-1");
    expect(rec.runId).toBe(runId);
    expect(inserts).toHaveLength(2);
    expect(updates).toEqual([{ message_id: "msg-1" }]);
  });
  it("ignores a malformed run id", () => {
    expect(createRunRecorder("u1", { db: fakeDb().db, runId: "x" }).runId).not.toBe("x");
  });
});
