import { describe, expect, it } from "vitest";
import { routeCommand } from "@/lib/command-router";

describe("command router", () => {
  it("routes build, fix and audit requests to the right subsystem", () => {
    expect(routeCommand("Build my website").target).toBe("generate");
    expect(routeCommand("Fix anything that's broken").target).toBe("self_heal");
    expect(routeCommand("Show me what's wrong").target).toBe("preflight");
    expect(routeCommand("Publish it").target).toBe("publish");
  });

  it("routes business systems to their own panels", () => {
    expect(routeCommand("Connect my domain").route).toBe("/app/domain");
    expect(routeCommand("Why was my card charged?").route).toBe("/app/billing");
    expect(routeCommand("Show me my leads").route).toBe("/app/leads");
    expect(routeCommand("Add booking").route).toBe("/app/calendar");
    expect(routeCommand("Add a quote calculator").route).toBe("/app/quotes");
    expect(routeCommand("Set up follow-up reminders").target).toBe("automations");
    expect(routeCommand("How is my traffic doing?").target).toBe("analytics");
  });

  it("passes design and SEO wording through to the assistant", () => {
    const design = routeCommand("Make this more premium");
    expect(design.target).toBe("design");
    expect(design.instruction).toBe("Make this more premium");
    expect(design.anchor).toBe("website-assistant");

    const seo = routeCommand("Improve my SEO");
    expect(seo.target).toBe("seo");
    expect(seo.instruction).toBe("Improve my SEO");
  });

  it("sends ordinary site edits to the assistant with the original wording", () => {
    const routed = routeCommand("Add a page for gutter cleaning");
    expect(routed.target).toBe("assistant");
    expect(routed.confident).toBe(true);
    expect(routed.instruction).toBe("Add a page for gutter cleaning");
  });

  it("never rejects wording it has no rule for", () => {
    const routed = routeCommand("i want people to stop leaving my page");
    expect(routed.target).toBe("assistant");
    expect(routed.confident).toBe(true);
    expect(routed.instruction).toBe("i want people to stop leaving my page");
    expect(routed.action).toBe("i want people to stop leaving my page");
  });

  it("handles an empty command without throwing", () => {
    const routed = routeCommand("   ");
    expect(routed.confident).toBe(false);
    expect(routed.instruction).toBeNull();
  });
});
