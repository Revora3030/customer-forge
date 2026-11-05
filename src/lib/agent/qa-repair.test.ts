import { describe, expect, it } from "vitest";
import { overflowCheck, runQaRepair, scoreFromChecks, type QaScore } from "@/lib/agent/qa-repair";

/** A fake page: the seeded bug is a fixed-width element that overflows at 390 px. */
function fakeSite(opts: { fixWorks?: boolean[]; scoreThrowsAfter?: number } = {}) {
  let overflow = true;
  let extraBreakage = false;
  const versions = new Map<string, { overflow: boolean; extraBreakage: boolean }>();
  const log: string[] = [];
  let scoreCalls = 0;
  let repairCalls = 0;
  const score = async (): Promise<QaScore> => {
    scoreCalls += 1;
    if (opts.scoreThrowsAfter !== undefined && scoreCalls > opts.scoreThrowsAfter) throw new Error("screenshot failed");
    return scoreFromChecks([
      overflowCheck({ viewportWidth: 390, scrollWidth: overflow ? 520 : 390 }),
      overflowCheck({ viewportWidth: 1280, scrollWidth: 1280 }),
      { id: "title", message: "Missing page title.", passed: !extraBreakage ? true : false },
    ]);
  };
  return {
    log,
    state: () => ({ overflow, extraBreakage }),
    calls: () => ({ scoreCalls, repairCalls }),
    deps: {
      score,
      snapshot: async () => {
        const id = `v${versions.size + 1}`;
        versions.set(id, { overflow, extraBreakage });
        log.push(`snapshot ${id}`);
        return id;
      },
      repair: async ({ round }: { round: number }) => {
        repairCalls += 1;
        const works = opts.fixWorks?.[round - 1] ?? true;
        if (works) overflow = false;
        else extraBreakage = true; // a bad fix that breaks something else
        log.push(`repair ${round} works=${works}`);
        return { changed: true, summary: works ? "Made the wide block fit phone screens." : "Changed the header." };
      },
      restore: async (id: string) => {
        const v = versions.get(id)!;
        overflow = v.overflow;
        extraBreakage = v.extraBreakage;
        log.push(`restore ${id}`);
      },
    },
  };
}

describe("scoring", () => {
  it("weights checks and scores unknown as zero", () => {
    expect(scoreFromChecks([]).score).toBe(0);
    const s = scoreFromChecks([overflowCheck({ viewportWidth: 390, scrollWidth: 520 }), { id: "a", message: "ok", passed: true }]);
    expect(s.score).toBe(25);
    expect(s.issues[0]).toMatchObject({ id: "overflow-390", viewport: 390 });
    expect(overflowCheck({ viewportWidth: 390, scrollWidth: 391 }).passed).toBe(true);
  });
});

describe("runQaRepair", () => {
  it("detects the seeded 390px overflow and repairs it within two rounds", async () => {
    const site = fakeSite();
    const result = await runQaRepair(site.deps);
    expect(result.before.issues.map((i) => i.id)).toContain("overflow-390");
    expect(result.status).toBe("repaired");
    expect(result.after.score).toBeGreaterThan(result.before.score);
    expect(site.state().overflow).toBe(false);
    expect(result.rounds.length).toBeLessThanOrEqual(2);
    expect(result.report).toMatch(/Score \d+ → \d+/);
    expect(site.log[0]).toBe("snapshot v1");
  });

  it("rolls back a repair that makes the score worse, then keeps a later one that helps", async () => {
    const site = fakeSite({ fixWorks: [false, true] });
    const result = await runQaRepair(site.deps);
    expect(result.rounds.map((r) => r.action)).toEqual(["rolled_back", "kept"]);
    expect(site.log).toContain("restore v1");
    expect(site.state()).toEqual({ overflow: false, extraBreakage: false });
    expect(result.status).toBe("repaired");
  });

  it("never exceeds two rounds and ends rolled back when nothing helps", async () => {
    const site = fakeSite({ fixWorks: [false, false, false] });
    const result = await runQaRepair({ ...site.deps, maxRounds: 9 });
    expect(site.calls().repairCalls).toBe(2);
    expect(result.status).toBe("rolled_back");
    expect(site.state()).toEqual({ overflow: true, extraBreakage: false });
    expect(result.after.score).toBe(result.before.score);
    expect(result.report).toMatch(/undid/);
  });

  it("does nothing to a page that already passes", async () => {
    const site = fakeSite();
    await site.deps.repair({ round: 1 });
    site.log.length = 0;
    const result = await runQaRepair(site.deps);
    expect(result.status).toBe("passed");
    expect(site.log).toEqual([]);
  });

  it("refuses to change anything without a restore point", async () => {
    const site = fakeSite();
    const result = await runQaRepair({ ...site.deps, snapshot: async () => { throw new Error("db down"); } });
    expect(result.status).toBe("failed");
    expect(site.state().overflow).toBe(true);
    expect(site.calls().repairCalls).toBe(0);
  });

  it("undoes a change it cannot re-check", async () => {
    const site = fakeSite({ scoreThrowsAfter: 1 });
    const result = await runQaRepair(site.deps);
    expect(result.rounds[0]?.action).toBe("rolled_back");
    expect(site.state().overflow).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("undoes and reports a repair that throws; reports no_change honestly", async () => {
    const site = fakeSite();
    const thrown = await runQaRepair({ ...site.deps, repair: async () => { throw new Error("tool down"); } });
    expect(thrown.status).toBe("failed");
    expect(site.log).toContain("restore v1");

    const idle = await runQaRepair({ ...fakeSite().deps, repair: async () => ({ changed: false, summary: "Nothing safe to change." }) });
    expect(idle.status).toBe("unchanged");
    expect(idle.rounds[0]?.action).toBe("no_change");
  });
});
