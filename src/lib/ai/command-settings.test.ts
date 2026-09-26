import { describe, expect, it } from "vitest";
import { applyRoutingOverrides } from "./command-settings.server";

const id = (x: string) => x;

describe("applyRoutingOverrides", () => {
  it("moves pinned models first in pin order", () => {
    expect(applyRoutingOverrides(["a", "b", "c"], id, { pinnedModels: ["c", "b"], pausedModels: [] })).toEqual(["c", "b", "a"]);
  });
  it("drops paused models", () => {
    expect(applyRoutingOverrides(["a", "b"], id, { pinnedModels: [], pausedModels: ["a"] })).toEqual(["b"]);
  });
  it("never leaves nothing to try", () => {
    expect(applyRoutingOverrides(["a"], id, { pinnedModels: [], pausedModels: ["a"] })).toEqual(["a"]);
  });
});
