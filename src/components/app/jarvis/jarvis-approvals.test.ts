import { describe, expect, it } from "vitest";
import { APPROVALS_KEY, MAX_APPROVALS, readApprovals, rememberApproval } from "./jarvis-approvals";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe("Jarvis approval memory", () => {
  it("survives a reload: a fresh read returns what was approved", () => {
    const storage = memoryStorage();
    rememberApproval("m1:0", { state: "done", url: "https://github.com/o/r/pull/7" }, storage);
    rememberApproval("m2:1", { state: "done" }, storage);
    // A reload: nothing in memory, only what storage holds.
    const reloaded = readApprovals(storage);
    expect(reloaded["m1:0"]).toEqual({ state: "done", url: "https://github.com/o/r/pull/7" });
    expect(reloaded["m2:1"]).toEqual({ state: "done" });
    expect(storage.map.has(APPROVALS_KEY)).toBe(true);
  });

  it(`caps at ${MAX_APPROVALS} entries, dropping the oldest`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_APPROVALS + 25; i += 1) rememberApproval(`m${i}:0`, { state: "done" }, storage);
    const all = readApprovals(storage);
    expect(Object.keys(all)).toHaveLength(MAX_APPROVALS);
    expect(all["m0:0"]).toBeUndefined();
    expect(all[`m${MAX_APPROVALS + 24}:0`]).toEqual({ state: "done" });
  });

  it("tolerates a throwing or corrupt localStorage", () => {
    const throwing = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    expect(readApprovals(throwing)).toEqual({});
    expect(rememberApproval("m1:0", { state: "done" }, throwing)).toEqual({ "m1:0": { state: "done" } });
    const corrupt = memoryStorage();
    corrupt.setItem(APPROVALS_KEY, "{not json");
    expect(readApprovals(corrupt)).toEqual({});
    corrupt.setItem(APPROVALS_KEY, JSON.stringify({ a: { state: "building" }, b: { state: "done", url: "javascript:alert(1)" } }));
    expect(readApprovals(corrupt)).toEqual({ b: { state: "done" } });
    expect(readApprovals(null)).toEqual({});
  });
});
