import { describe, expect, it } from "vitest";
import { currentLovableUsage } from "./health-merge";

describe("current admin AI health", () => {
  it("excludes retired provider history without modifying the stored rows", () => {
    const records = [{ provider: "cerebras", ok: true }, { provider: "lovable", ok: false }, { provider: "groq", ok: false }, { provider: "lovable", ok: true }];
    expect(currentLovableUsage(records)).toEqual([records[1], records[3]]);
    expect(records).toHaveLength(4);
  });
});