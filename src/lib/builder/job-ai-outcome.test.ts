import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { backupModelAnswered, recordJobFallback } from "./job-ai-outcome";

function fakeDb(events: { ok: boolean; fallback_used: boolean; created_at: string; organization_id: string }[], opts: { updateError?: boolean } = {}) {
  const updates: unknown[] = [];
  const db = {
    updates,
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), chain),
        gte: (col: string, value: string) => (filters.push((r) => String(r[col]) >= value), chain),
        update: (patch: unknown) => (updates.push({ table, patch }), chain),
        then: (resolve: (v: unknown) => void) => {
          if (updates.length && table === "generation_jobs") return resolve({ error: opts.updateError ? { message: "no column" } : null });
          const count = events.filter((e) => filters.every((f) => f(e as never))).length;
          return resolve({ count, error: null });
        },
      };
      return chain;
    },
  };
  return db;
}

const since = "2026-11-01T10:00:00.000Z";
const job = { id: "job-1", organization_id: "org-1" };
const ev = (over: Partial<{ ok: boolean; fallback_used: boolean; created_at: string; organization_id: string }> = {}) => ({
  ok: true, fallback_used: true, created_at: "2026-11-01T10:05:00.000Z", organization_id: "org-1", ...over,
});

describe("job fallback recording", () => {
  it("marks the job when a backup model answered during the attempt", async () => {
    const db = fakeDb([ev()]);
    expect(await recordJobFallback(db as never, job, since)).toBe(true);
    expect(db.updates).toEqual([{ table: "generation_jobs", patch: { fallback_used: true } }]);
  });

  it("ignores failed fallback calls, other workspaces and calls from before the attempt", async () => {
    const db = fakeDb([ev({ ok: false }), ev({ organization_id: "org-2" }), ev({ created_at: "2026-11-01T09:00:00.000Z" }), ev({ fallback_used: false })]);
    expect(await backupModelAnswered(db as never, "org-1", since)).toBe(false);
    expect(await recordJobFallback(db as never, job, since)).toBe(false);
    expect(db.updates).toEqual([]);
  });

  it("never throws when storage fails or the column is missing", async () => {
    expect(await recordJobFallback(fakeDb([ev()], { updateError: true }) as never, job, since)).toBe(false);
    const broken = { from: () => { throw new Error("db down"); } };
    expect(await recordJobFallback(broken as never, job, since)).toBe(false);
  });

  it("the migration is one additive column with a default", () => {
    const sql = readFileSync("supabase/migrations/20261101060100_generation_jobs_fallback_used.sql", "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false");
    expect(sql).not.toMatch(/DROP|ALTER COLUMN|GRANT|POLICY|stripe|billing|price/i);
  });
});
