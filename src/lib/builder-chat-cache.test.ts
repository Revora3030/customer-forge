import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAllCachedTurns, clearCachedTurns, readCachedTurns, writeCachedTurns } from "./builder-chat-cache";
function storage(): Storage {
  const items = new Map<string, string>();
  return { get length() { return items.size; }, clear: () => items.clear(), getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null, removeItem: (key) => { items.delete(key); }, setItem: (key, value) => { items.set(key, value); } };
}
afterEach(() => vi.unstubAllGlobals());
describe("safe workspace chat cache", () => {
  it("falls back to session storage when local storage getters are blocked", () => {
    const sessionStorage = storage();
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); }, sessionStorage });
    writeCachedTurns("org-a", [{ role: "user", content: "Saved question", at: "2026-10-11T14:30:00Z" }]);
    expect(readCachedTurns("org-a")[0]?.content).toBe("Saved question");
    expect(() => clearAllCachedTurns()).not.toThrow();
    expect(sessionStorage.length).toBe(0);
  });
  it("does not throw when both storage getters are blocked", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); }, get sessionStorage() { throw new Error("blocked"); } });
    expect(readCachedTurns("org-a")).toEqual([]);
    expect(() => clearAllCachedTurns()).not.toThrow();
  });
  it("clears chat keys in both stores without removing auth or preference keys", () => {
    const localStorage = storage(), sessionStorage = storage();
    vi.stubGlobal("window", { localStorage, sessionStorage });
    for (const store of [localStorage, sessionStorage]) { store.setItem("rv-builder-turns:org-a", "[]"); store.setItem("auth-token", "keep"); }
    clearAllCachedTurns();
    for (const store of [localStorage, sessionStorage]) { expect(store.getItem("rv-builder-turns:org-a")).toBeNull(); expect(store.getItem("auth-token")).toBe("keep"); }
  });
  it("does not mix workspace keys and can clear one workspace", () => {
    const localStorage = storage(); vi.stubGlobal("window", { localStorage });
    writeCachedTurns("org-a", [{ role: "user", content: "A", at: "1" }]);
    writeCachedTurns("org-b", [{ role: "user", content: "B", at: "2" }]);
    clearCachedTurns("org-a"); expect(readCachedTurns("org-a")).toEqual([]); expect(readCachedTurns("org-b")[0]?.content).toBe("B");
  });
  it("ignores malformed local JSON and tries the legacy session copy", () => {
    const localStorage = storage(), sessionStorage = storage(); vi.stubGlobal("window", { localStorage, sessionStorage });
    localStorage.setItem("rv-builder-turns:org-a", "{");
    sessionStorage.setItem("rv-builder-turns:org-a", JSON.stringify([{ role: "user", content: "Fallback", at: "1" }]));
    expect(readCachedTurns("org-a")[0]?.content).toBe("Fallback");
  });
  it("keeps a bounded number of valid turns and sanitizes saved metadata", () => {
    const localStorage = storage(); vi.stubGlobal("window", { localStorage });
    localStorage.setItem("rv-builder-turns:org-a", JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ role: "assistant", content: `Reply ${i}`, at: `${i}`, taskResult: { state: "complete", applied: "bad" } }))));
    const turns = readCachedTurns("org-a"); expect(turns).toHaveLength(80); expect(turns[0]?.content).toBe("Reply 20"); expect(turns[0]?.taskResult).toEqual({ state: "complete" });
  });
  it("preserves the legacy shape when optional metadata is absent", () => {
    const localStorage = storage(); vi.stubGlobal("window", { localStorage });
    const turns = [{ role: "user" as const, content: "Question", at: "1" }];
    writeCachedTurns("org-a", turns); expect(readCachedTurns("org-a")).toEqual(turns);
  });
  it("does not let serialization failure interrupt the caller", () => {
    const turn: Record<string, unknown> = { role: "user", content: "Question", at: "1" };
    turn["cycle"] = turn;
    expect(() => writeCachedTurns("org-a", [turn as never])).not.toThrow();
  });
});
