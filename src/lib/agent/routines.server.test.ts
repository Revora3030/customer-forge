import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_ROUTINES_PER_ORG, ROUTINE_PRESETS, parseRoutineInput, routineGoal, runDueAgentRoutines,
  type AgentRoutine, type RoutineRepo,
} from "./routines.server";
import { nextRunAfter } from "./routine-schedule";

const NOW = new Date("2026-11-09T15:00:00Z"); // Monday 10:00 ET

function routine(over: Partial<AgentRoutine> = {}): AgentRoutine & { suspended?: boolean } {
  return {
    id: "r1", organization_id: "org-1", created_by: "u1", name: "Weekly digest", preset: "weekly_digest", prompt: null,
    frequency: "weekly", weekday: 1, month_day: null, hour: 8, minute: 0, enabled: true,
    next_run_at: "2026-10-26T12:00:00Z", claim_token: null, last_run_at: null, last_run_id: null, last_status: null, ...over,
  };
}

/** In-memory copy of agent_routine_claim_due / fire / release. */
function memoryRepo(rows: (AgentRoutine & { suspended?: boolean })[]) {
  const runs: { goal: string; routineId: string }[] = [];
  const repo: RoutineRepo = {
    async claimDue() {
      const out: AgentRoutine[] = [];
      for (const r of rows) {
        if (!r.enabled || r.suspended || r.claim_token || new Date(r.next_run_at) > NOW) continue;
        r.claim_token = `tok-${r.id}`;
        out.push({ ...r });
      }
      return out;
    },
    async fire(id, token, next, goal) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.claim_token !== token || !r.enabled || r.suspended) return null;
      runs.push({ goal, routineId: id });
      r.next_run_at = next.toISOString(); r.claim_token = null; r.last_status = "queued";
      return `run-${runs.length}`;
    },
    async release(id, token, next, status) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.claim_token !== token) return false;
      r.next_run_at = next.toISOString(); r.claim_token = null; r.last_status = status;
      return true;
    },
  };
  return { repo, runs };
}

describe("runDueAgentRoutines", () => {
  it("fires a long-missed routine once, then not again until its next slot", async () => {
    const rows = [routine()]; // due since two weeks ago: two slots missed
    const { repo, runs } = memoryRepo(rows);
    expect((await runDueAgentRoutines(repo, NOW)).started).toHaveLength(1);
    expect((await runDueAgentRoutines(repo, NOW)).started).toHaveLength(0);
    expect(runs).toHaveLength(1);
    expect(new Date(rows[0]!.next_run_at).getTime()).toBeGreaterThan(NOW.getTime());
    expect(rows[0]!.next_run_at).toBe(nextRunAfter({ frequency: "weekly", weekday: 1, hour: 8, minute: 0 }, NOW).toISOString());
  });

  it("starts no run for a suspended workspace or a paused routine", async () => {
    const { repo, runs } = memoryRepo([routine({ id: "a" }), routine({ id: "b", enabled: false })].map((r, i) => (i === 0 ? { ...r, suspended: true } : r)));
    const result = await runDueAgentRoutines(repo, NOW);
    expect(result).toMatchObject({ claimed: 0, started: [] });
    expect(runs).toHaveLength(0);
  });

  it("a second pass cannot start a routine the first pass holds", async () => {
    const rows = [routine()];
    const { repo } = memoryRepo(rows);
    const first = await repo.claimDue(10, 300);
    expect(first).toHaveLength(1);
    expect(await repo.claimDue(10, 300)).toHaveLength(0);
    expect(await repo.fire("r1", "wrong-token", NOW, "goal")).toBeNull();
  });

  it("a failed start moves the routine on instead of retrying every pass", async () => {
    const rows = [routine()];
    const { repo } = memoryRepo(rows);
    repo.fire = async () => { throw new Error("db down"); };
    const spy = console.error;
    console.error = () => undefined;
    const result = await runDueAgentRoutines(repo, NOW);
    console.error = spy;
    expect(result).toMatchObject({ claimed: 1, skipped: 1, started: [] });
    expect(rows[0]!.claim_token).toBeNull();
    expect(new Date(rows[0]!.next_run_at).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("parks a routine with an unreadable schedule for a day", async () => {
    const rows = [routine({ hour: 99 })];
    const { repo, runs } = memoryRepo(rows);
    await runDueAgentRoutines(repo, NOW);
    expect(runs).toHaveLength(0);
    expect(rows[0]!.next_run_at).toBe(new Date(NOW.getTime() + 86_400_000).toISOString());
    expect(rows[0]!.last_status).toMatch(/check this routine/);
  });
});

describe("routine safety", () => {
  it("no preset can send on its own", () => {
    for (const preset of Object.values(ROUTINE_PRESETS)) expect(["no_external_actions", "approval_required"]).toContain(preset.sendPolicy);
    expect(ROUTINE_PRESETS.review_asks.sendPolicy).toBe("approval_required");
    expect(ROUTINE_PRESETS.review_asks.goal).toMatch(/until the owner approves/);
    expect(ROUTINE_PRESETS.site_refresh.goal).toMatch(/do not change or publish/i);
  });

  it("custom routines get the approval guard appended", () => {
    expect(routineGoal({ preset: "custom", prompt: "Summarise open quotes." })).toMatch(/waits for the owner's approval/);
  });

  it("the migration only ever sets a safe send policy and never lets a client write", () => {
    const sql = readFileSync("supabase/migrations/20261101060400_agent_routines.sql", "utf8");
    expect(sql).toMatch(/'no_external_actions' ELSE 'approval_required'/);
    expect(sql).not.toMatch(/auto_send|'auto'|DROP TABLE|ALTER TABLE public\.(?!agent_routines ENABLE)/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL) TO authenticated/);
  });

  it("limits a workspace to 5 routines", () => {
    expect(MAX_ROUTINES_PER_ORG).toBe(5);
    expect(readFileSync("supabase/migrations/20261101060400_agent_routines.sql", "utf8")).toMatch(/>= 5/);
  });
});

describe("parseRoutineInput", () => {
  it("fills a preset's schedule and name when none is given", () => {
    const input = parseRoutineInput({ preset: "weekly_digest" });
    expect(input).toMatchObject({ name: "Weekly digest", schedule: { frequency: "weekly", weekday: 1 } });
  });
  it("requires a real instruction for custom routines and a valid schedule", () => {
    expect(() => parseRoutineInput({ preset: "custom", name: "Mine", prompt: "short" })).toThrow(/sentence/);
    expect(() => parseRoutineInput({ preset: "weekly_digest", schedule: { frequency: "monthly", monthDay: 40, hour: 9, minute: 0 } })).toThrow(/1 and 28/);
    expect(() => parseRoutineInput({ preset: "nope" })).toThrow(/routine types/);
  });
});
