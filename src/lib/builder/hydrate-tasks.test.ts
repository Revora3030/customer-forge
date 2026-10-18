import { describe, expect, it } from "vitest";
import { newTask } from "@/lib/builder-queue";
import { appliedThisSession, hydrateTasks, IN_FLIGHT_WINDOW_MS, mergeRestored, UNKNOWN_OUTCOME } from "./hydrate-tasks";

describe("hydrating saved chat requests", () => {
  it("shows a retried request still pending at reload only once", () => {
    // Pending on this device under its live id, saved under the normalised id.
    const resumed = [{ ...newTask("Add pricing"), id: "t1~r2" }];
    const restored = hydrateTasks([{ instruction: "Add pricing", reply: "", at: "1", requestId: "t1_r2" }]);
    const tasks = mergeRestored(restored, resumed);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("t1~r2");
  });

  it("keeps the unknown-outcome error instead of inventing 'Done.'", () => {
    const [task] = hydrateTasks([{ instruction: "Add a gallery", reply: "", at: "1", requestId: "t9" }]);
    expect(task?.state).toBe("failed");
    expect(task?.error).toBe(UNKNOWN_OUTCOME);
    expect(task?.retryable).toBe(true);
    expect(task?.reply).not.toBe("Done.");
  });

  it("restores the request under its own id with its stored counts", () => {
    const [task] = hydrateTasks([
      {
        instruction: "Redesign the home page",
        reply: "Updated your draft · 5 changes",
        at: "1",
        requestId: "t3",
        taskResult: { state: "complete", applied: 5, failedCount: 1, staleCount: 1, snapshotVersion: 7 },
      },
    ]);
    expect(task).toMatchObject({ id: "t3", state: "complete", applied: 5, failedCount: 1, staleCount: 1, snapshotVersion: 7, restored: true, answered: false });
  });

  it("shows a just-sent request with no reply as still working, never retryable", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    const [recent] = hydrateTasks([{ instruction: "Add pricing", reply: "", at: "2026-10-18T11:50:00Z", requestId: "t7" }], now);
    expect(recent).toMatchObject({ state: "planning", tracking: true });
    expect(recent?.retryable).toBeUndefined();
    expect(recent?.error).toBeUndefined();
    const [old] = hydrateTasks(
      [{ instruction: "Add pricing", reply: "", at: new Date(now - IN_FLIGHT_WINDOW_MS - 1000).toISOString(), requestId: "t8" }],
      now,
    );
    expect(old).toMatchObject({ state: "failed", retryable: true, error: UNKNOWN_OUTCOME });
  });

  it("brings a cancelled request back as cancelled, not as an unknown failure", () => {
    const [task] = hydrateTasks([
      { instruction: "Add a map", reply: "Cancelled.", at: "1", requestId: "t9", taskResult: { state: "skipped" } },
    ]);
    expect(task?.state).toBe("skipped");
    expect(task?.retryable).toBeUndefined();
  });

  it("only changes applied live in this session drive the screen check", () => {
    const restored = { ...newTask("old"), id: "t1", state: "complete" as const, applied: 4, restored: true };
    const live = { ...newTask("new"), id: "t2", state: "complete" as const, applied: 2 };
    expect(appliedThisSession([restored])).toEqual([]);
    expect(appliedThisSession([restored, live]).map((task) => task.id)).toEqual(["t2"]);
  });

  it("treats a plain reply without a saved outcome as an answer", () => {
    const [task] = hydrateTasks([{ instruction: "What can you do?", reply: "I can…", at: "1" }]);
    expect(task?.state).toBe("complete");
    expect(task?.answered).toBe(true);
    expect(task?.id).toMatch(/^t/);
  });
});
