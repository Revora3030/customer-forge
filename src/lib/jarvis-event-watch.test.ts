import { describe, expect, it } from "vitest";
import { eventMarker, lastProposedFrom, runJarvisEventWatch } from "@/lib/jarvis-event-watch.server";
import { buildFailedSource } from "@/lib/event-sources.server";
import type { EventSource } from "@/lib/cognition/event-emitter";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const inserts: Record<string, unknown>[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      gte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return q; },
      ilike: (c: string, v: string) => { const needle = v.replaceAll("%", ""); rows = rows.filter((r) => String(r[c]).includes(needle)); return q; },
      order: () => q,
      limit: () => Promise.resolve({ data: rows, error: null }),
      insert: (row: Record<string, unknown>) => { inserts.push(row); return Promise.resolve({ error: null }); },
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { db: { from } as never, inserts };
}

const base = (): Record<string, Record<string, unknown>[]> => ({
  generation_jobs: [{ id: "j1", organization_id: "o1", status: "failed", updated_at: iso(3_600_000), failed_stage: "layout" }],
  organizations: [{ id: "o1", name: "Acme Plumbing" }],
  user_roles: [{ user_id: "u1", role: "super_admin" }, { user_id: "u2", role: "member" }],
  jarvis_messages: [],
});

describe("jarvis event watch", () => {
  it("posts one plain notice per super admin for a recent failed build, and changes nothing else", async () => {
    const { db, inserts } = fakeDb(base());
    const run = await runJarvisEventWatch(db, NOW, [buildFailedSource(db)]);
    expect(run).toMatchObject({ events: 1, users: 1, posted: 1, failed: 0 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ user_id: "u1", role: "assistant" });
    expect(String(inserts[0]!["content"])).toContain("Acme Plumbing");
    expect(String(inserts[0]!["content"])).toContain("nothing was changed");
    expect(String(inserts[0]!["content"])).toContain('stopped at "Section layouts composed" (step 11 of 14)');
    expect(String(inserts[0]!["content"])).toContain(eventMarker("build-failed-review", "Acme Plumbing"));
  });

  it("does not repeat a notice inside its cooldown, and does again after it", async () => {
    const tables = base();
    tables["jarvis_messages"] = [{ user_id: "u1", role: "assistant", content: `Heads up ${eventMarker("build-failed-review", "Acme Plumbing")}`, created_at: iso(3_600_000) }];
    const recent = fakeDb(tables);
    expect((await runJarvisEventWatch(recent.db, NOW, [buildFailedSource(recent.db)])).posted).toBe(0);
    tables["jarvis_messages"] = [{ user_id: "u1", role: "assistant", content: `Heads up ${eventMarker("build-failed-review", "Acme Plumbing")}`, created_at: iso(7 * 3_600_000) }];
    const old = fakeDb(tables);
    expect((await runJarvisEventWatch(old.db, NOW, [buildFailedSource(old.db)])).posted).toBe(1);
  });

  it("ignores builds that failed more than a day ago and does nothing when no build failed", async () => {
    const tables = base();
    tables["generation_jobs"] = [{ id: "j0", organization_id: "o1", status: "failed", updated_at: iso(2 * 86_400_000), failed_stage: null }];
    const { db, inserts } = fakeDb(tables);
    expect(await runJarvisEventWatch(db, NOW, [buildFailedSource(db)])).toMatchObject({ events: 0, posted: 0 });
    expect(inserts).toEqual([]);
  });

  it("names an unreadable source instead of treating it as quiet, and still posts what the others found", async () => {
    const { db, inserts } = fakeDb(base());
    const broken: EventSource = { name: "ci.failed", read: async () => { throw new Error("GitHub answered 403"); } };
    const run = await runJarvisEventWatch(db, NOW, [broken, buildFailedSource(db)]);
    expect(run.failedSources).toEqual(["ci.failed"]);
    expect(run.posted).toBe(1);
    expect(inserts).toHaveLength(1);
    const onlyBroken = await runJarvisEventWatch(fakeDb(base()).db, NOW, [broken]);
    expect(onlyBroken).toMatchObject({ events: 0, posted: 0, failedSources: ["ci.failed"] });
  });

  it("writes each rule's own wording, not the build wording", async () => {
    const { db, inserts } = fakeDb(base());
    const trial: EventSource = { name: "client.trial_expiring", read: async () => [{ id: "t1", type: "client.trial_expiring", occurredAt: NOW, subject: "Blue Door Salon", detail: "Trial ends 2026-10-28 09:00 UTC." }] };
    await runJarvisEventWatch(db, NOW, [trial]);
    const content = String(inserts[0]!["content"]);
    expect(content).toContain("Blue Door Salon's free trial ends within a day");
    expect(content).toContain("Nothing was sent to them.");
    expect(content).not.toContain("site build");
  });

  it("reads cooldown state only from well-formed markers", () => {
    expect(lastProposedFrom([
      { content: `x ${eventMarker("ci-failed-triage", "main")}`, created_at: iso(1000) },
      { content: "no marker here", created_at: iso(1000) },
      { content: `y ${eventMarker("ci-failed-triage", "main")}`, created_at: "garbage" },
    ])).toEqual({ "ci-failed-triage|main": NOW - 1000 });
  });

  it("skips an owner whose earlier notices can't be read instead of re-posting everything", async () => {
    const { db: inner, inserts } = fakeDb(base());
    const db = {
      from: (table: string) => {
        const q = (inner as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
        if (table !== "jarvis_messages") return q;
        return { ...q, select: () => broken };
      },
    };
    const broken: Record<string, unknown> = {
      eq: () => broken,
      ilike: () => broken,
      gte: () => broken,
      limit: () => Promise.resolve({ data: null, error: { message: "timeout" } }),
    };
    const run = await runJarvisEventWatch(db as never, NOW, [buildFailedSource(inner)]);
    expect(run).toMatchObject({ events: 1, users: 1, posted: 0, skippedUsers: 1 });
    expect(inserts).toEqual([]);
  });

  it("reports the admin list as a failed source when it can't be read", async () => {
    const { db: inner, inserts } = fakeDb(base());
    const db = {
      from: (table: string) => {
        const q = (inner as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
        if (table !== "user_roles") return q;
        const bad: Record<string, unknown> = { select: () => bad, eq: () => Promise.resolve({ data: null, error: { message: "denied" } }) };
        return bad;
      },
    };
    const run = await runJarvisEventWatch(db as never, NOW, [buildFailedSource(inner)]);
    expect(run.failedSources).toContain("jarvis.admins");
    expect(run.posted).toBe(0);
    expect(inserts).toEqual([]);
  });
});
