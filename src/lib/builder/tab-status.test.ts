import { describe, expect, it } from "vitest";
import { baseTitle, nextTabStatus, outcomeStatus, tabTitle } from "./tab-status";

describe("LOV-15 tab status", () => {
  it("prefixes the title and never stacks prefixes", () => {
    const t = tabTitle("Website · Revora", "building");
    expect(t).toBe("● Building… · Website · Revora");
    expect(tabTitle(t, "ready")).toBe("✓ Site ready · Website · Revora");
    expect(tabTitle(tabTitle(t, "failed"), null)).toBe("Website · Revora");
    expect(baseTitle("Website · Revora")).toBe("Website · Revora");
  });

  it("maps finished request states", () => {
    expect(outcomeStatus("complete")).toBe("ready");
    expect(outcomeStatus("waiting_for_approval")).toBe("review");
    expect(outcomeStatus("failed")).toBe("failed");
    expect(outcomeStatus("queued")).toBeNull();
  });

  it("only shows anything while the tab is hidden", () => {
    const base = { working: true, wasWorking: false, lastState: "building", current: null };
    expect(nextTabStatus({ ...base, hidden: false })).toBeNull();
    expect(nextTabStatus({ ...base, hidden: true })).toBe("building");
  });

  it("shows the outcome when work ends in the background, keeps it until seen", () => {
    const done = nextTabStatus({ hidden: true, working: false, wasWorking: true, lastState: "complete", current: "building" });
    expect(done).toBe("ready");
    expect(nextTabStatus({ hidden: true, working: false, wasWorking: false, lastState: "complete", current: "ready" })).toBe("ready");
    expect(nextTabStatus({ hidden: false, working: false, wasWorking: false, lastState: "complete", current: "ready" })).toBeNull();
  });

  it("drops a stale building status when idle", () => {
    expect(nextTabStatus({ hidden: true, working: false, wasWorking: false, lastState: null, current: "building" })).toBeNull();
  });
});
