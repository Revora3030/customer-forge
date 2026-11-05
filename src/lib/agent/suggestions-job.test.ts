import { describe, expect, it } from "vitest";
import { runSuggestionsJob } from "./suggestions-job.server";
import type { SuggestionRepo } from "./suggestions.server";
import { evidenceLines } from "./suggestion-evidence";

const now = new Date("2026-11-05T11:25:00Z");
function repo(failOrg?: string): SuggestionRepo & { inserted: string[] } {
  const inserted: string[] = [];
  return {
    inserted,
    async collect(org) {
      if (org === failOrg) throw new Error("boom");
      return { now, unansweredLeads: { count: 2, oldestAt: "2026-11-01T00:00:00Z", ids: ["a", "b"] } };
    },
    async current() { return []; },
    async insert(org, f) { inserted.push(`${org}:${f.signal}`); },
    async resolve() {},
    async get() { return null; },
    async update() {},
  };
}

describe("runSuggestionsJob", () => {
  it("runs one pass per workspace and keeps going after a failure", async () => {
    const r = repo("o2");
    const out = await runSuggestionsJob(async () => ["o1", "o2", "o3"], r, { now });
    expect(out).toMatchObject({ workspaces: 3, created: 2, failed: 1, stoppedEarly: false });
    expect(r.inserted).toEqual(["o1:unanswered_leads", "o3:unanswered_leads"]);
  });
  it("stops at the time budget", async () => {
    let t = 0;
    const out = await runSuggestionsJob(async () => ["o1", "o2", "o3"], repo(), { now, budgetMs: 10, clock: () => (t += 6) });
    expect(out.stoppedEarly).toBe(true);
    expect(out.workspaces).toBeLessThan(3);
  });
});

describe("evidenceLines", () => {
  it("states only stored facts", () => {
    expect(evidenceLines("unanswered_leads", { count: 2, oldestAt: "2026-11-01T00:00:00Z" })).toEqual(["2 leads still marked new after 24 hours", "Oldest from Nov 1, 2026"]);
    expect(evidenceLines("traffic_drop", { last7: 10, prior7: 40 })).toEqual(["10 page views in the last 7 days vs 40 the week before"]);
    expect(evidenceLines("traffic_drop", {})).toEqual([]);
    expect(evidenceLines("unknown", { count: 1 })).toEqual([]);
  });
});
