import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

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

  it("never stores attachment data, only that there were attachments", () => {
    const store = memoryStore();
    addPending(
      "org",
      { id: "t1", instruction: "Use this photo", hadAttachments: true, sentAt: at(-1000), ...({ attachments: [{ dataUrl: "data:image/png;base64,AAAA" }] } as object) },
      store,
    );
    const raw = store.getItem("rv-builder-pending:org") ?? "";
    expect(raw).not.toContain("base64");
    expect(readPending("org", store, now)[0]).toMatchObject({ id: "t1", hadAttachments: true });
  });

  it("does not mistake a saved user turn for a completed request", () => {
    const pending = [
      { id: "t1", instruction: "Finish my site", sentAt: at(-2000) },
      { id: "t2", instruction: "Add a FAQ", sentAt: at(-1000) },
    ];
    const saved = [{ content: "Finish my site", at: at(-1500) }];
    expect(unresolvedPending(pending, saved).map((r) => r.id)).toEqual(["t1", "t2"]);
  });

  it("preserves repeated instructions as distinct requests", () => {
    const pending = [
      { id: "t1", instruction: "Improve my hero", sentAt: at(-2000) },
      { id: "t2", instruction: "Improve my hero", sentAt: at(-1000) },
    ];
    const saved = [{ content: "Improve my hero", at: at(-500) }];
    expect(unresolvedPending(pending, saved)).toEqual(pending);
  });

  it("preserves attachment recovery flags and returns a separate list", () => {
    const pending = [{ id: "t1", instruction: "Use my photo", hadAttachments: true, sentAt: at(-1000) }];
    const restored = unresolvedPending(pending, [{ content: "Use my photo", at: at(0) }]);
    expect(restored).toEqual(pending);
    expect(restored).not.toBe(pending);
    restored.pop();
    expect(pending).toHaveLength(1);
  });

  it("still clears an explicitly finished request after its user turn was saved", () => {
    const store = memoryStore();
    addPending("org", { id: "t1", instruction: "Finish my site", sentAt: at(-1000) }, store);
    const saved = [{ content: "Finish my site", at: at(-500) }];
    expect(unresolvedPending(readPending("org", store, now), saved)).toHaveLength(1);
    clearPending("org", "t1", store);
    expect(unresolvedPending(readPending("org", store, now), saved)).toEqual([]);
  });
});
