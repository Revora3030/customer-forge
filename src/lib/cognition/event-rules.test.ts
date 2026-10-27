import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_RULES, MAX_PROPOSALS_PER_PASS, planEventResponses, type PlatformEvent } from "./event-rules";

const NOW = 1_800_000_000_000;
const ev = (id: string, type: string, subject: string, at = NOW - 1000): PlatformEvent => ({ id, type, subject, occurredAt: at });

describe("planEventResponses", () => {
  it("proposes routine work for matching events only", () => {
    const { proposals } = planEventResponses({ events: [ev("1", "build.failed", "Acme"), ev("2", "page.viewed", "Acme")], rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: NOW });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ ruleId: "build-failed-review", subject: "Acme" });
    expect(proposals[0]!.prompt).toContain("Acme");
  });

  it("respects the cooldown per rule and subject, and counts what it drops", () => {
    const events = [ev("1", "ci.failed", "main"), ev("2", "ci.failed", "main"), ev("3", "ci.failed", "other")];
    const first = planEventResponses({ events, rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: NOW });
    expect(first.proposals.map((p) => p.subject)).toEqual(["main", "other"]);
    expect(first.dropped).toBe(1);
    const again = planEventResponses({ events: [ev("4", "ci.failed", "main")], rules: DEFAULT_EVENT_RULES, lastProposed: { "ci-failed-triage|main": NOW - 60_000 }, now: NOW });
    expect(again.proposals).toEqual([]);
    const later = planEventResponses({ events: [ev("5", "ci.failed", "main")], rules: DEFAULT_EVENT_RULES, lastProposed: { "ci-failed-triage|main": NOW - 2 * 3_600_000 }, now: NOW });
    expect(later.proposals).toHaveLength(1);
  });

  it("caps proposals per pass even if asked for more", () => {
    const events = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, "build.failed", `site-${i}`, NOW - i));
    const { proposals, dropped } = planEventResponses({ events, rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: NOW, maxProposals: 100 });
    expect(proposals).toHaveLength(MAX_PROPOSALS_PER_PASS);
    expect(dropped).toBe(15);
  });
});
