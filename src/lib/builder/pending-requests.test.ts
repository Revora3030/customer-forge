import { describe, expect, it } from "vitest";
import { addPending, clearAllPending, clearPending, readPending, unresolvedPending, PENDING_MAX_AGE_MS } from "./pending-requests";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const now = Date.parse("2026-10-07T12:00:00.000Z");
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();

describe("pending builder requests", () => {
  it("keeps a sent request until it reaches an end state", () => {
    const store = memoryStore();
    addPending("org", { id: "t1", instruction: "Fix my whole site", sentAt: at(-1000) }, store);
    expect(readPending("org", store, now).map((r) => r.instruction)).toEqual(["Fix my whole site"]);
    clearPending("org", "t1", store);
    expect(readPending("org", store, now)).toEqual([]);
  });

  it("clears a retried request by its base id and never mixes workspaces", () => {
    const store = memoryStore();
    addPending("org", { id: "t1", instruction: "a", sentAt: at(-1000) }, store);
    addPending("other", { id: "t9", instruction: "b", sentAt: at(-1000) }, store);
    clearPending("org", "t1~rabc", store);
    expect(readPending("org", store, now)).toEqual([]);
    expect(readPending("other", store, now)).toHaveLength(1);
    clearAllPending("other", store);
    expect(readPending("other", store, now)).toEqual([]);
  });

  it("ignores requests older than a day and corrupt storage", () => {
    const store = memoryStore();
    addPending("org", { id: "old", instruction: "x", sentAt: at(-PENDING_MAX_AGE_MS - 1) }, store);
    expect(readPending("org", store, now)).toEqual([]);
    store.setItem("rv-builder-pending:org", "{not json");
    expect(readPending("org", store, now)).toEqual([]);
    expect(readPending("org", null, now)).toEqual([]);
  });

  it("drops a request that already finished and was saved to the conversation", () => {
    const pending = [
      { id: "t1", instruction: "Finish my site", sentAt: "2026-10-07T11:00:00.000Z" },
      { id: "t2", instruction: "Add a FAQ", sentAt: "2026-10-07T11:05:00.000Z" },
    ];
    const saved = [{ content: "Finish my site", at: "2026-10-07T11:00:02.000Z" }];
    expect(unresolvedPending(pending, saved).map((r) => r.id)).toEqual(["t2"]);
  });
});
