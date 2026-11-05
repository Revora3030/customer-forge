import { describe, expect, it } from "vitest";
import {
  appendJarvisPlan,
  applyResume,
  buildMultiStepPlan,
  derivePlanSteps,
  effectLabel,
  MIN_PLAN_STEPS,
  progressSummary,
  readPlanProgress,
  resumeEligibility,
  splitJarvisPlan,
  writePlanProgress,
  type MultiStepPlan,
  type PlanProgress,
} from "./multi-step-plan";
import type { WriteProposal } from "@/lib/jarvis-actions";

const memory: Record<string, string> = {};
const storage = {
  getItem: (key: string) => memory[key] ?? null,
  setItem: (key: string, value: string) => {
    memory[key] = value;
  },
};

describe("buildMultiStepPlan", () => {
  it("returns null for a single step (no card)", () => {
    expect(buildMultiStepPlan({ reads: [{ toolId: "code.read", title: "Read src/a.ts" }] })).toBeNull();
  });

  it("numbers read then write steps and marks write as needing approval", () => {
    const plan = buildMultiStepPlan({
      reads: [
        { toolId: "code.search", title: 'Searched the code for "lead"' },
        { toolId: "demos.list", title: "Listed demo sites" },
      ],
      proposals: [{ id: "builds.recover" } as WriteProposal],
    });
    expect(plan?.steps).toHaveLength(3);
    expect(plan?.steps.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(plan?.steps[0]?.effect).toBe("read");
    expect(plan?.steps[0]?.requiresApproval).toBe(false);
    expect(plan?.steps[0]?.status).toBe("done");
    expect(plan?.steps[2]?.effect).toBe("destructive");
    expect(plan?.steps[2]?.requiresApproval).toBe(true);
    expect(plan?.steps[2]?.status).toBe("pending");
    expect(plan?.steps[2]?.title).toBe("Restart stalled builds");
  });

  it("never invents city or business names — write titles are fixed labels from tool ids", () => {
    const plan = buildMultiStepPlan({
      reads: [{ toolId: "web.search", title: 'Searched the web for "roofers"' }],
      proposals: [{ id: "demo.build" } as WriteProposal],
    });
    expect(plan?.steps[1]?.title).toBe("Build a demo site");
    expect(JSON.stringify(plan)).not.toMatch(/Austin|fake city|\$9\.99|Owner-supplied/i);
  });
});

describe("serialize / parse", () => {
  it("round-trips through the message tag and strips it from the body", () => {
    const plan = buildMultiStepPlan({
      reads: [
        { toolId: "inbox.list", title: "Checked prospect replies" },
        { toolId: "engine.today", title: "Checked the prospect engine funnel" },
      ],
    })!;
    const reply = appendJarvisPlan("Here is the plan.", plan);
    expect(reply).toContain("<jarvis-plan>");
    const { body, plan: parsed } = splitJarvisPlan(reply);
    expect(body).toBe("Here is the plan.");
    expect(parsed?.steps).toHaveLength(2);
    expect(parsed?.steps[0]?.title).toBe("Checked prospect replies");
  });

  it("ignores corrupt or short plans", () => {
    expect(splitJarvisPlan("hi <jarvis-plan>not-json</jarvis-plan>").plan).toBeNull();
    expect(splitJarvisPlan(`hi <jarvis-plan>${JSON.stringify({ version: 1, steps: [{ title: "only one", effect: "read", status: "done" }] })}</jarvis-plan>`).plan).toBeNull();
    expect(MIN_PLAN_STEPS).toBe(2);
  });
});

describe("progress + resume", () => {
  const base: MultiStepPlan = {
    version: 1,
    steps: [
      { id: "a", index: 1, title: "Read code", toolId: "code.read", effect: "read", requiresApproval: false, status: "done" },
      { id: "b", index: 2, title: "Open PR", toolId: "code.pr", effect: "write", requiresApproval: true, status: "failed" },
      { id: "c", index: 3, title: "Send demo", toolId: "demo.send", effect: "write", requiresApproval: true, status: "pending" },
    ],
  };

  it("derives doing / next / failed from overrides", () => {
    const progress: PlanProgress = {
      decision: "approved",
      stepStatus: { b: "failed", c: "pending" },
      resumeFrom: 1,
      updatedAt: "2026-11-05T06:00:00.000Z",
    };
    const steps = derivePlanSteps(base, progress);
    const summary = progressSummary(steps);
    expect(summary.doneCount).toBe(1);
    expect(summary.failed?.id).toBe("b");
    expect(summary.next?.id).toBe("c");
    expect(effectLabel("write")).toBe("Write");
  });

  it("allows resume from a failed write when later writes are not done", () => {
    const steps = derivePlanSteps(base, null);
    const eligibility = resumeEligibility(steps);
    expect(eligibility.canResume).toBe(true);
    expect(eligibility.fromIndex).toBe(1);
    expect(eligibility.reason).toContain("Queued, will apply next");
    const resumed = applyResume(steps, 1);
    expect(resumed[1]?.status).toBe("pending");
    expect(resumed[2]?.status).toBe("pending");
  });

  it("blocks resume when a later write already finished", () => {
    const steps = derivePlanSteps(base, {
      decision: "approved",
      stepStatus: { b: "failed", c: "done" },
      resumeFrom: null,
      updatedAt: "2026-11-05T06:00:00.000Z",
    });
    const eligibility = resumeEligibility(steps);
    expect(eligibility.canResume).toBe(false);
    expect(eligibility.reason).toMatch(/not duplicated/i);
  });

  it("persists progress on a device-local store", () => {
    for (const key of Object.keys(memory)) delete memory[key];
    const saved = writePlanProgress(
      "msg-1",
      { decision: "approved", stepStatus: { a: "done" }, resumeFrom: null, updatedAt: "2026-11-05T06:00:00.000Z" },
      storage,
    );
    expect(saved.decision).toBe("approved");
    expect(readPlanProgress("msg-1", storage)?.stepStatus['a']).toBe("done");
    expect(readPlanProgress("other", storage)).toBeNull();
  });
});
