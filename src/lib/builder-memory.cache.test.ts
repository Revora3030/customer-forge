import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe("builder chat cache", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("survives a new tab (localStorage) and stays scoped per workspace", async () => {
    const memory = await import("./builder-memory");
    memory.writeCachedTurns("org-a", [{ role: "user", content: "hi", at: "2026-10-07T00:00:00Z" }]);
    expect(window.localStorage.getItem("rv-builder-turns:org-a")).toContain("hi");
    expect(memory.readCachedTurns("org-a")).toHaveLength(1);
    expect(memory.readCachedTurns("org-b")).toHaveLength(0);
  });

  it("still reads the older sessionStorage copy", async () => {
    const memory = await import("./builder-memory");
    window.sessionStorage.setItem(
      "rv-builder-turns:org-a",
      JSON.stringify([{ role: "assistant", content: "done", at: "2026-10-07T00:00:00Z" }]),
    );
    expect(memory.readCachedTurns("org-a")[0]?.content).toBe("done");
  });

  it("clears every workspace's chat on sign-out but leaves other keys", async () => {
    const memory = await import("./builder-memory");
    memory.writeCachedTurns("org-a", [{ role: "user", content: "a", at: "x" }]);
    memory.writeCachedTurns("org-b", [{ role: "user", content: "b", at: "x" }]);
    window.localStorage.setItem("unrelated", "keep");
    memory.clearAllCachedTurns();
    expect(memory.readCachedTurns("org-a")).toHaveLength(0);
    expect(memory.readCachedTurns("org-b")).toHaveLength(0);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});
