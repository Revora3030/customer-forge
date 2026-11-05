import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanCard } from "./PlanCard";
import type { MultiStepPlan } from "@/lib/jarvis/multi-step-plan";

const plan: MultiStepPlan = {
  version: 1,
  steps: [
    { id: "r1", index: 1, title: "Listed demo sites", toolId: "demos.list", effect: "read", requiresApproval: false, status: "done" },
    { id: "w1", index: 2, title: "Restart stalled builds", toolId: "builds.recover", effect: "destructive", requiresApproval: true, status: "pending" },
  ],
};

describe("PlanCard", () => {
  it("renders numbered steps with read vs write marks and approve/edit/cancel", () => {
    const html = renderToStaticMarkup(<PlanCard plan={plan} messageId="m-plan-1" onAsk={() => undefined} />);
    expect(html).toContain("1. Listed demo sites");
    expect(html).toContain("2. Restart stalled builds");
    expect(html).toContain("Read");
    expect(html).toContain("Destructive");
    expect(html).toContain("Needs its own approval");
    expect(html).toContain("Approve plan");
    expect(html).toContain("Edit");
    expect(html).toContain("Cancel");
    expect(html).toContain("saved on this device");
    expect(html).toContain('data-testid="jarvis-plan-card"');
  });

  it("shows an honest empty state when there are no steps", () => {
    const html = renderToStaticMarkup(<PlanCard plan={{ version: 1, steps: [] }} messageId="m-empty" />);
    expect(html).toContain("No steps were recorded");
    expect(html).not.toContain("Approve plan");
  });

  it("keeps controls at least 44px tall", () => {
    const html = renderToStaticMarkup(<PlanCard plan={plan} messageId="m-a11y" onAsk={() => undefined} />);
    expect(html).toContain("min-h-11");
  });
});
