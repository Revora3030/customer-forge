import { describe, expect, it } from "vitest";

import { summarizeBuilderFunnel, type BuilderFunnelRow } from "@/lib/builder-funnel";

const row = (event: string, org: string, reason?: string): BuilderFunnelRow => ({
  event_name: event,
  session_id: `s-${org}`,
  metadata: reason ? { organization_id: org, reason } : { organization_id: org },
  created_at: new Date().toISOString(),
});

describe("builder drop-off", () => {
  it("counts each workspace once, however many times it acts", () => {
    const summary = summarizeBuilderFunnel(
      [
        row("builder_opened", "a"),
        row("builder_opened", "a"),
        row("build_requested", "a"),
        row("build_requested", "a"),
        row("build_applied", "a"),
        row("site_published", "a"),
        row("site_published", "a"),
      ],
      30,
    );
    expect(summary.opened).toBe(1);
    expect(summary.requested).toBe(1);
    expect(summary.published).toBe(1);
    expect(summary.publishRate).toBe(100);
  });

  it("places each workspace at the furthest step it reached", () => {
    const summary = summarizeBuilderFunnel(
      [
        // Went all the way live.
        row("builder_opened", "live"),
        row("build_requested", "live"),
        row("build_applied", "live"),
        row("site_published", "live"),
        // Built something, never published.
        row("builder_opened", "built"),
        row("build_requested", "built"),
        row("build_applied", "built"),
        // Asked, nothing landed.
        row("builder_opened", "asked"),
        row("build_requested", "asked"),
        // Only looked.
        row("builder_opened", "looked"),
      ],
      30,
    );
    expect(summary.opened).toBe(4);
    const byKey = Object.fromEntries(summary.stages.map((s) => [s.key, s]));
    expect(byKey["opened"]!.droppedHere).toBe(1); // "looked"
    expect(byKey["requested"]!.droppedHere).toBe(1); // "asked"
    expect(byKey["applied"]!.droppedHere).toBe(1); // "built"
    expect(byKey["published"]!.count).toBe(1);
    // Every workspace is accounted for exactly once.
    const dropped = summary.stages.reduce((sum, s) => sum + s.droppedHere, 0);
    expect(dropped + summary.published).toBe(summary.opened);
  });

  it("never reports a later step as bigger than an earlier one", () => {
    // Only the publish event survived — the earlier ones were lost.
    const summary = summarizeBuilderFunnel([row("site_published", "orphan")], 7);
    expect(summary.opened).toBe(1);
    expect(summary.requested).toBe(1);
    expect(summary.applied).toBe(1);
    expect(summary.published).toBe(1);
  });

  it("groups the reasons publishing was refused, per workspace", () => {
    const summary = summarizeBuilderFunnel(
      [
        row("publish_blocked", "one", "setup_unpaid"),
        row("publish_blocked", "one", "setup_unpaid"),
        row("publish_blocked", "two", "setup_unpaid"),
        row("publish_blocked", "three", "not_ready"),
      ],
      30,
    );
    expect(summary.publishBlockers[0]).toMatchObject({ reason: "setup_unpaid", workspaces: 2 });
    expect(summary.publishBlockers[1]).toMatchObject({ reason: "not_ready", workspaces: 1 });
    expect(summary.stuckAtPublish).toBe(3);
  });

  it("stops counting a workspace as stuck once it goes live", () => {
    const summary = summarizeBuilderFunnel(
      [row("publish_failed", "a"), row("site_published", "a")],
      30,
    );
    expect(summary.publishGlitches).toBe(1);
    expect(summary.stuckAtPublish).toBe(0);
  });

  it("reads nothing from rows with no workspace or visit attached", () => {
    const summary = summarizeBuilderFunnel(
      [{ event_name: "builder_opened", session_id: null, metadata: null }],
      30,
    );
    expect(summary.opened).toBe(0);
  });

  it("reports zero rather than dividing by nothing", () => {
    const summary = summarizeBuilderFunnel([], 30);
    expect(summary.publishRate).toBe(0);
    expect(summary.stages.every((s) => s.rate === 0 && s.dropRate === 0)).toBe(true);
  });
});
