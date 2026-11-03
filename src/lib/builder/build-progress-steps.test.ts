import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATION_STEPS } from "@/lib/site-engine";
import { buildTrackerModel } from "@/lib/builder/build-progress-steps";

const states = (model: NonNullable<ReturnType<typeof buildTrackerModel>>) => model.steps.map((s) => s.state);

describe("buildTrackerModel", () => {
  it("shows nothing when there is no job or an unknown status", () => {
    expect(buildTrackerModel(null)).toBeNull();
    expect(buildTrackerModel({})).toBeNull();
    expect(buildTrackerModel({ status: "mystery" })).toBeNull();
  });

  it("lists every real generation stage with its real label", () => {
    const model = buildTrackerModel({ status: "queued" })!;
    expect(model.steps.map((s) => s.key)).toEqual(GENERATION_STEPS.map((s) => s.key));
    expect(model.steps.map((s) => s.label)).toEqual(GENERATION_STEPS.map((s) => s.label));
  });

  it("queued: nothing started, nothing current", () => {
    const model = buildTrackerModel({ status: "queued", attempts: 0 })!;
    expect(model.phase).toBe("queued");
    expect(model.statusLabel).toBe("Queued");
    expect(states(model).every((s) => s === "pending")).toBe(true);
  });

  it("queued after an attempt is a retry wait that keeps finished stages", () => {
    const model = buildTrackerModel({ status: "queued", attempts: 1, steps: ["business", "services"], current_step: "services" })!;
    expect(model.statusLabel).toBe("Waiting to retry");
    expect(states(model).slice(0, 3)).toEqual(["done", "done", "pending"]);
  });

  it("processing: finished stages are done, the next one is current, the rest pending", () => {
    const model = buildTrackerModel({ status: "processing", steps: ["business", "services", "brand"], current_step: "brand" })!;
    expect(model.phase).toBe("building");
    expect(states(model).slice(0, 5)).toEqual(["done", "done", "done", "current", "pending"]);
    expect(states(model).filter((s) => s === "current")).toHaveLength(1);
    expect(model.summary).toContain(GENERATION_STEPS[3]!.label);
    expect(model.doneCount).toBe(3);
  });

  it("processing with current_step only still marks earlier stages done", () => {
    const model = buildTrackerModel({ status: "processing", current_step: "structure" })!;
    expect(model.doneCount).toBe(5);
    expect(model.steps[5]!.state).toBe("current");
  });

  it("processing before the first stage finishes marks the first stage current", () => {
    const model = buildTrackerModel({ status: "processing", steps: [] })!;
    expect(model.steps[0]!.state).toBe("current");
  });

  it("ignores unknown stage keys instead of inventing stages", () => {
    const model = buildTrackerModel({ status: "processing", steps: ["not_a_stage", 7, "business"], current_step: "nope" })!;
    expect(model.doneCount).toBe(1);
    expect(model.steps).toHaveLength(GENERATION_STEPS.length);
  });

  it("completed: every stage is done", () => {
    const model = buildTrackerModel({ status: "completed", steps: ["business"] })!;
    expect(model.phase).toBe("completed");
    expect(states(model).every((s) => s === "done")).toBe(true);
    expect(model.failure).toBeNull();
    expect(model.completedNote).toBeNull();
  });

  it("completed with a worker note passes it through unchanged", () => {
    const model = buildTrackerModel({ status: "completed", error_message: "Some sections used a basic design." })!;
    expect(model.completedNote).toBe("Some sections used a basic design.");
  });

  it("failed: marks the recorded failed stage and shows the existing failure message", () => {
    const model = buildTrackerModel({
      status: "failed",
      steps: ["business", "services"],
      current_step: "services",
      failed_stage: "brand",
      failure_kind: "provider",
      error_message: "[provider] upstream 429",
    })!;
    expect(model.phase).toBe("failed");
    expect(states(model).slice(0, 4)).toEqual(["done", "done", "failed", "pending"]);
    expect(model.failure?.label).toBe("AI provider unavailable");
    expect(model.failure?.message).toMatch(/Nothing was published/);
  });

  it("failed without a recorded stage points at the first unfinished stage", () => {
    const model = buildTrackerModel({ status: "failed", steps: ["business"], current_step: "business" })!;
    expect(model.steps[1]!.state).toBe("failed");
    expect(model.failure?.label).toBe("Build didn't finish");
  });

  it("failed with an untagged error shows that error message", () => {
    const model = buildTrackerModel({ status: "failed", error_message: "Something specific broke." })!;
    expect(model.failure?.message).toBe("Something specific broke.");
  });

  it("cancelled: honest cancelled state, no failed stage", () => {
    const model = buildTrackerModel({ status: "cancelled", steps: ["business"], current_step: "business", failure_kind: "cancelled" })!;
    expect(model.phase).toBe("cancelled");
    expect(states(model)).not.toContain("failed");
    expect(model.failure?.label).toBe("Cancelled by you");
  });

  it("never exposes a percentage or time estimate", () => {
    const model = buildTrackerModel({ status: "processing", steps: ["business"], progress: 6 } as never)!;
    expect(JSON.stringify(model)).not.toMatch(/%|minute|ETA/i);
  });
});

describe("BuildProgressTracker wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("is mounted on the Welcome page", () => {
    const src = read("src/routes/_authenticated/app.welcome.tsx");
    expect(src).toContain('import { BuildProgressTracker } from "@/components/app/BuildProgressTracker"');
    expect(src).toContain("<BuildProgressTracker organizationId={orgId} />");
  });

  it("reuses the existing job poller and shows no percent", () => {
    const src = read("src/components/app/BuildProgressTracker.tsx");
    expect(src).toContain("useLatestGenerationJob");
    expect(src).not.toMatch(/progressbar|\.progress\b|width:/);
  });
});
