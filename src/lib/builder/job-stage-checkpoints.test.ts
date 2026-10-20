import { describe, expect, it } from "vitest";
import { readStage, writeStage } from "./job-stage-checkpoints";

describe("early-stage build checkpoints", () => {
  it("reuses a finished stage for the same job and inputs", () => {
    const saved = writeStage(null, "job-1", "brief", { name: "Shined Up" }, { concept: "x" });
    expect(readStage(saved, "job-1", "brief", { name: "Shined Up" })).toEqual({ concept: "x" });
  });
  it("regenerates when the inputs changed", () => {
    const saved = writeStage(null, "job-1", "brief", { name: "Shined Up" }, { concept: "x" });
    expect(readStage(saved, "job-1", "brief", { name: "Other" })).toBeNull();
  });
  it("never reuses another job's work", () => {
    const saved = writeStage(null, "job-1", "brief", {}, { concept: "x" });
    expect(readStage(saved, "job-2", "brief", {})).toBeNull();
  });
  it("keeps earlier stages when adding one", () => {
    const one = writeStage(null, "job-1", "brief", {}, 1);
    const two = writeStage(one, "job-1", "identity", {}, 2);
    expect(readStage(two, "job-1", "brief", {})).toBe(1);
    expect(readStage(two, "job-1", "identity", {})).toBe(2);
  });
});
