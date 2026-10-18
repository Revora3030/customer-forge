import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monitoring.server", () => ({ captureError: vi.fn(async () => undefined) }));
vi.mock("@/lib/builder/first-build-images.server", () => ({
  cleanupFirstBuildImages: vi.fn(
    async (
      db: { from: (table: string) => { delete: () => { eq: (k: string, v: unknown) => { in: (k: string, v: unknown[]) => Promise<unknown> } } } },
      orgId: string,
      assets: { mediaId: string | null }[],
    ) => {
      await db
        .from("media")
        .delete()
        .eq("organization_id", orgId)
        .in(
          "id",
          assets.map((asset) => asset.mediaId),
        );
    },
  ),
}));

import { restoreWebsiteFromBackup } from "@/lib/backup.server";
import { captureError } from "@/lib/monitoring.server";
import {
  LEASE_SECONDS,
  materializingGeneration,
  resolveBuildMode,
  settleAbandonedFreshRebuild,
  settleFailedAttempt,
  StaleAttemptError,
  sweepCancelledFreshRebuilds,
} from "@/lib/site-engine.worker.server";
import { STALLED_LEASE_GRACE_MS } from "@/lib/builder/job-liveness";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Call = { table: string; op: string; value?: unknown };

/** Reads "a->b->>c" JSON paths the way PostgREST does. */
function readPath(row: Row, path: string): unknown {
  const parts = path.split(/->>?/);
  let value: unknown = row;
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Row)[part];
  }
  return value;
}

/**
 * In-memory Supabase fake that executes the real predicates and writes, so
 * the tests check what the code does to the data rather than its source text.
 */
function database(seed: Record<string, Row[]>, options: { rpcError?: string } = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  const calls: Call[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const db = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return options.rpcError ? { data: null, error: { message: options.rpcError } } : { data: { pages: 1 }, error: null };
    },
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
    from(table: string) {
      calls.push({ table, op: "from" });
      const rows = tables[table] ?? (tables[table] = []);
      const predicates: Array<(row: Row) => boolean> = [];
      let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
      let value: Row | Row[] | undefined;
      let columns = "*";
      let countMode = false;
      let head = false;
      let limit = Infinity;
      let sort: { key: string; ascending: boolean } | undefined;
      let result: { data: Row[] | null; error: null; count?: number } | undefined;
      const query = {
        select: (cols = "*", opts?: { count?: string; head?: boolean }) => {
          columns = cols;
          countMode = Boolean(opts?.count);
          head = Boolean(opts?.head);
          return query;
        },
        insert: (v: Row | Row[]) => { op = "insert"; value = v; calls.push({ table, op, value: v }); return query; },
        update: (v: Row) => { op = "update"; value = v; calls.push({ table, op, value: v }); return query; },
        upsert: (v: Row) => { op = "upsert"; value = v; calls.push({ table, op, value: v }); return query; },
        delete: () => { op = "delete"; calls.push({ table, op }); return query; },
        eq: (key: string, v: unknown) => { predicates.push((row) => readPath(row, key) === v); return query; },
        neq: (key: string, v: unknown) => { predicates.push((row) => readPath(row, key) !== v); return query; },
        in: (key: string, v: unknown[]) => { predicates.push((row) => v.includes(readPath(row, key))); return query; },
        is: (key: string, v: unknown) => { predicates.push((row) => (readPath(row, key) ?? null) === v); return query; },
        not: (key: string, operator: string, v: unknown) => {
          if (operator === "is") predicates.push((row) => (readPath(row, key) ?? null) !== v);
          return query;
        },
        filter: (key: string, operator: string, v: unknown) => {
          if (operator === "eq") predicates.push((row) => readPath(row, key) === v);
          return query;
        },
        lt: (key: string, v: string) => { predicates.push((row) => row[key] != null && row[key] < v); return query; },
        lte: (key: string, v: string) => { predicates.push((row) => row[key] != null && row[key] <= v); return query; },
        gte: (key: string, v: string) => { predicates.push((row) => row[key] != null && row[key] >= v); return query; },
        like: (key: string, pattern: string) => {
          const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
          predicates.push((row) => re.test(String(row[key] ?? "")));
          return query;
        },
        ilike: (key: string, pattern: string) => {
          const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
          predicates.push((row) => re.test(String(row[key] ?? "")));
          return query;
        },
        order: (key: string, opts?: { ascending?: boolean }) => { sort = { key, ascending: opts?.ascending !== false }; return query; },
        limit: (n: number) => { limit = n; return query; },
        maybeSingle: async () => {
          const out = execute();
          return { ...out, data: out.data?.[0] ?? null };
        },
        single: async () => {
          const out = execute();
          return { ...out, data: out.data?.[0] ?? null };
        },
        then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve().then(() => execute()).then(resolve, reject),
      };
      function project(row: Row): Row {
        const out: Row = { ...row };
        for (const part of columns.split(",").map((c) => c.trim())) {
          const alias = part.match(/^(\w+):(.+)$/);
          if (alias) out[alias[1]!] = readPath(row, alias[2]!);
        }
        return out;
      }
      function execute() {
        if (result) return result;
        if (op === "insert") {
          const list = Array.isArray(value) ? value : [value!];
          rows.push(...list.map((row) => ({ ...row })));
          result = { data: list.map(project), error: null };
          return result;
        }
        if (op === "upsert") {
          const v = value as Row;
          const existing = rows.find((row) => (v["id"] && row["id"] === v["id"]) || (v["organization_id"] && row["organization_id"] === v["organization_id"] && !v["id"]));
          if (existing) Object.assign(existing, v);
          else rows.push({ ...v });
          result = { data: [project(existing ?? v)], error: null };
          return result;
        }
        let selected = rows.filter((row) => predicates.every((predicate) => predicate(row)));
        if (sort) {
          const { key, ascending } = sort;
          selected = [...selected].sort((a, b) => (ascending ? 1 : -1) * String(a[key]).localeCompare(String(b[key])));
        }
        selected = selected.slice(0, limit);
        if (op === "update") selected.forEach((row) => Object.assign(row, value));
        if (op === "delete") for (const row of selected) rows.splice(rows.indexOf(row), 1);
        const data = selected.map(project);
        result = { data: head ? null : data, error: null, ...(countMode ? { count: selected.length } : {}) };
        return result;
      }
      return query;
    },
  };
  return { db: db as never, tables, calls, rpcCalls };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const BACKUP = "33333333-3333-4333-8333-333333333333";
const JOB_CREATED = "2026-10-17T11:42:15.000Z";

function freshRebuildSeed(overrides: { pages?: Row[]; generation?: Row; media?: Row[]; components?: Row[] } = {}) {
  return {
    generation_jobs: [
      { id: JOB, organization_id: ORG, created_by: "owner-1", created_at: JOB_CREATED, status: "failed", error_message: "[infrastructure] The build was interrupted." },
    ],
    website_settings: [
      {
        organization_id: ORG,
        publish_state: "published",
        generation: overrides.generation ?? {
          brief: { approved: true },
          jobId: JOB,
          buildState: "materializing",
          buildStartedAt: "2026-10-17T11:44:55.000Z",
          pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: JOB },
        },
      },
    ],
    website_pages: overrides.pages ?? [
      { id: "p1", organization_id: ORG, created_at: "2026-09-21T00:00:00Z" },
      { id: "p2", organization_id: ORG, created_at: "2026-09-21T00:00:00Z" },
    ],
    website_components: overrides.components ?? [],
    media: overrides.media ?? [],
    data_backups: [
      {
        id: BACKUP,
        organization_id: ORG,
        kind: "pre_restore",
        label: "Before fresh AI rebuild 2026-10-17T11:42:00Z",
        created_at: "2026-10-17T11:42:00.000Z",
        snapshot: {
          format: 1,
          organization_id: ORG,
          website: { format: "1", pages: [{ id: "p1" }, { id: "p2" }] },
          tables: {
            website_settings: [
              {
                organization_id: ORG,
                generation: { brief: { approved: true }, copy: { heroHeadline: "Old" } },
                seo: { title: "Old" },
                template: "ai-authored",
                publish_state: "draft",
                published: false,
                custom_domain: "old.example.com",
                domain_verified: true,
              },
            ],
            business_profiles: [{ organization_id: ORG, primary_color: "#112233", font_preference: "Fraunces", phone: "555" }],
            leads: [{ id: "lead-old", organization_id: ORG }],
          },
        },
      },
    ],
    leads: [{ id: "lead-new", organization_id: ORG }],
    business_profiles: [{ organization_id: ORG, primary_color: "#000000", phone: "999" }],
  } satisfies Record<string, Row[]>;
}

const job = { id: JOB, organization_id: ORG, created_by: "owner-1", created_at: JOB_CREATED };

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("materializing marker keeps the fresh rebuild (3.R-a)", () => {
  it("keeps pendingBuild, stamps the jobId and drops nothing else", () => {
    const prior = { brief: { approved: true }, copy: { a: 1 }, pendingBuild: { mode: "fresh_replace", backupId: BACKUP } };
    const next = materializingGeneration(prior, JOB, prior.pendingBuild, true, "2026-10-17T12:00:00.000Z");
    expect(next).toEqual({
      brief: { approved: true },
      copy: { a: 1 },
      pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: JOB },
      jobId: JOB,
      buildState: "materializing",
      buildStartedAt: "2026-10-17T12:00:00.000Z",
    });
    // A safe build adds no marker.
    expect(materializingGeneration({ brief: 1 }, JOB, null, false, "t")).toEqual({
      brief: 1,
      jobId: JOB,
      buildState: "materializing",
      buildStartedAt: "t",
    });
  });

  it("the materializing write no longer strips the marker", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker).not.toContain("...withoutPendingBuild(priorGeneration)");
    expect(worker).toContain("generation: materializingGeneration(");
  });

  it("resolveBuildMode: a same-job marker replaces, another job's marker is reported", () => {
    const own = { pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: JOB } };
    expect(resolveBuildMode(own, { id: JOB })).toEqual({ freshReplace: true, foreignMarkerJobId: null });
    const foreign = { pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: "other-job" } };
    expect(resolveBuildMode(foreign, { id: JOB })).toEqual({ freshReplace: false, foreignMarkerJobId: "other-job" });
    expect(resolveBuildMode({}, { id: JOB })).toEqual({ freshReplace: false, foreignMarkerJobId: null });
    expect(resolveBuildMode(null, { id: JOB })).toEqual({ freshReplace: false, foreignMarkerJobId: null });
  });
});

describe("a failed attempt's cleanup (3.R-a step 3)", () => {
  const asset = { slot: "hero", path: `${ORG}/first-build-hero.png`, mediaId: "m1" } as never;

  it("a superseded attempt rethrows the same StaleAttemptError with no cleanup or restore", async () => {
    const { db } = database({ generation_jobs: [{ id: JOB, status: "processing" }] });
    const cleanupImages = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => ({ restored: true, restoreError: null }));
    const stale = new StaleAttemptError(JOB);
    await expect(
      settleFailedAttempt(db, { error: stale, jobId: JOB, generatedAssets: [asset], freshReplace: true, backupId: BACKUP }, { cleanupImages, rollback }),
    ).rejects.toBe(stale);
    expect(cleanupImages).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("a cancelled attempt cleans up and restores", async () => {
    const { db } = database({ generation_jobs: [{ id: JOB, status: "cancelled" }] });
    const cleanupImages = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => ({ restored: true, restoreError: null }));
    await expect(
      settleFailedAttempt(db, { error: new StaleAttemptError(JOB), jobId: JOB, generatedAssets: [asset], freshReplace: true, backupId: BACKUP }, { cleanupImages, rollback }),
    ).rejects.toThrow(`restored from backup ${BACKUP}`);
    expect(cleanupImages).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith(BACKUP, expect.any(String));
  });
});

describe("settleAbandonedFreshRebuild (3.R-b)", () => {
  it("disturbed: one website-only restore, CRM untouched, marker cleared, message names the backup", async () => {
    const { db, tables, calls, rpcCalls } = database(
      freshRebuildSeed({ pages: [{ id: "new", organization_id: ORG, created_at: "2026-10-17T11:45:00Z" }] }),
    );
    const outcome = await settleAbandonedFreshRebuild(db, job);
    expect(outcome).toMatchObject({ skipped: false, restored: true, disturbed: true, backupId: BACKUP });
    expect(rpcCalls.filter((call) => call.name === "restore_website_state")).toHaveLength(1);
    expect(calls.some((call) => call.table === "leads")).toBe(false);
    expect(tables["leads"]).toEqual([{ id: "lead-new", organization_id: ORG }]);
    const generation = tables["website_settings"]![0]!["generation"] as Row;
    expect(generation["pendingBuild"]).toBeUndefined();
    expect(generation["buildState"]).toBeUndefined();
    expect(String(tables["generation_jobs"]![0]!["error_message"])).toContain(`Previous website restored from backup ${BACKUP}`);
    expect(tables["ai_generations"]?.[0]).toMatchObject({ kind: "fresh_rebuild_rollback", job_id: JOB });
  });

  it("disturbed when the site has fewer pages than the backup", async () => {
    const { db, rpcCalls } = database(freshRebuildSeed({ pages: [{ id: "p1", organization_id: ORG, created_at: "2026-09-21T00:00:00Z" }] }));
    await settleAbandonedFreshRebuild(db, job);
    expect(rpcCalls).toHaveLength(1);
  });

  it("untouched: no restore, only this job's unused first-build generated pictures removed", async () => {
    const media = [
      { id: "gen-new", organization_id: ORG, source: "generated", file_name: "first-build-hero.png", url: `${ORG}/a.png`, created_at: "2026-10-17T11:44:00Z" },
      { id: "gen-used", organization_id: ORG, source: "generated", file_name: "first-build-work.png", url: `${ORG}/b.png`, created_at: "2026-10-17T11:44:00Z" },
      { id: "gen-old", organization_id: ORG, source: "generated", file_name: "first-build-old.png", url: `${ORG}/c.png`, created_at: "2026-09-01T00:00:00Z" },
      { id: "owner", organization_id: ORG, source: "owner", file_name: "first-build-mine.png", url: `${ORG}/d.png`, created_at: "2026-10-17T11:44:00Z" },
      { id: "studio", organization_id: ORG, source: "generated", file_name: "ai-studio.png", url: `${ORG}/e.png`, created_at: "2026-10-17T11:44:00Z" },
    ];
    const { db, tables, rpcCalls } = database(
      freshRebuildSeed({ media, components: [{ id: "c1", organization_id: ORG, media_url: `${ORG}/b.png` }] }),
    );
    const outcome = await settleAbandonedFreshRebuild(db, job);
    expect(outcome).toMatchObject({ skipped: false, disturbed: false, restored: false });
    expect(rpcCalls).toHaveLength(0);
    expect(tables["media"]!.map((row) => row["id"]).sort()).toEqual(["gen-old", "gen-used", "owner", "studio"]);
    expect(String(tables["generation_jobs"]![0]!["error_message"])).toContain(BACKUP);
  });

  it("two concurrent settles restore once", async () => {
    const { db, rpcCalls } = database(
      freshRebuildSeed({ pages: [{ id: "new", organization_id: ORG, created_at: "2026-10-17T11:45:00Z" }] }),
    );
    const [first, second] = await Promise.all([settleAbandonedFreshRebuild(db, job), settleAbandonedFreshRebuild(db, job)]);
    expect([first.skipped, second.skipped].filter(Boolean)).toHaveLength(1);
    expect(rpcCalls).toHaveLength(1);
  });

  it("a failed restore says rollback failed and notifies the workspace", async () => {
    const { db, tables } = database(
      freshRebuildSeed({ pages: [{ id: "new", organization_id: ORG, created_at: "2026-10-17T11:45:00Z" }] }),
      { rpcError: "tree invalid" },
    );
    const outcome = await settleAbandonedFreshRebuild(db, job);
    expect(outcome).toMatchObject({ skipped: false, restored: false });
    const message = String(tables["generation_jobs"]![0]!["error_message"]);
    expect(message).toContain("Rollback failed");
    expect(message).toContain(`restore backup ${BACKUP} from History`);
    expect(tables["notifications"]).toHaveLength(1);
    expect(tables["notifications"]![0]).toMatchObject({ organization_id: ORG });
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("skips a job whose marker is gone or names another job", async () => {
    const { db, rpcCalls } = database(freshRebuildSeed({ generation: { brief: {}, pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: "other" } } }));
    expect(await settleAbandonedFreshRebuild(db, job)).toMatchObject({ skipped: true });
    expect(rpcCalls).toHaveLength(0);
  });

  it("settles a legacy materializing-only marker from the labelled backup", async () => {
    const { db, rpcCalls, tables } = database(
      freshRebuildSeed({
        generation: { jobId: JOB, buildState: "materializing" },
        pages: [{ id: "new", organization_id: ORG, created_at: "2026-10-17T11:45:00Z" }],
      }),
    );
    expect(await settleAbandonedFreshRebuild(db, job)).toMatchObject({ skipped: false, backupId: BACKUP });
    expect(rpcCalls).toHaveLength(1);
    expect(String(tables["generation_jobs"]![0]!["error_message"])).toContain(BACKUP);
  });

  it("a cancel inside the grace window is left alone; after it, it is settled", async () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    const seed = freshRebuildSeed({ pages: [{ id: "new", organization_id: ORG, created_at: "2026-10-17T11:45:00Z" }] });
    Object.assign(seed.generation_jobs[0]!, { status: "cancelled", cancel_requested_at: recent });
    const { db, rpcCalls, tables } = database(seed);
    await sweepCancelledFreshRebuilds(db);
    expect(rpcCalls).toHaveLength(0);
    expect((tables["website_settings"]![0]!["generation"] as Row)["pendingBuild"]).toBeTruthy();

    tables["generation_jobs"]![0]!["cancel_requested_at"] = new Date(
      Date.now() - (LEASE_SECONDS * 1000 + STALLED_LEASE_GRACE_MS) - 1_000,
    ).toISOString();
    await sweepCancelledFreshRebuilds(db);
    expect(rpcCalls).toHaveLength(1);
    expect((tables["website_settings"]![0]!["generation"] as Row)["pendingBuild"]).toBeUndefined();
  });
});

describe("restoreWebsiteFromBackup (3.R-b)", () => {
  it("restores only the website and never writes publish, domain or CRM data", async () => {
    const { db, calls, tables } = database(freshRebuildSeed());
    expect(await restoreWebsiteFromBackup(db, BACKUP, ORG)).toEqual({ restored: true });
    const writes = calls.filter((call) => call.op === "update" || call.op === "upsert" || call.op === "insert" || call.op === "delete");
    for (const write of writes) {
      const value = (write.value ?? {}) as Row;
      for (const forbidden of ["publish_state", "published", "custom_domain", "domain_verified"]) {
        expect(Object.keys(value)).not.toContain(forbidden);
      }
    }
    const touched = new Set(calls.map((call) => call.table));
    for (const crm of ["leads", "customers", "appointments", "quote_requests", "lead_activities", "media"]) {
      expect(touched.has(crm)).toBe(false);
    }
    const settings = tables["website_settings"]![0]!;
    expect(settings["publish_state"]).toBe("published");
    expect(settings["seo"]).toEqual({ title: "Old" });
    expect((settings["generation"] as Row)["pendingBuild"]).toBeUndefined();
    expect(tables["business_profiles"]![0]).toMatchObject({ primary_color: "#112233", font_preference: "Fraunces", phone: "999" });
  });

  it("refuses a backup from another workspace or without a page tree", async () => {
    const seed = freshRebuildSeed();
    const { db, rpcCalls } = database(seed);
    expect(await restoreWebsiteFromBackup(db, BACKUP, "99999999-9999-4999-8999-999999999999")).toMatchObject({ restored: false });
    (seed.data_backups[0]!.snapshot as Row)["website"] = { format: "1" };
    expect(await restoreWebsiteFromBackup(db, BACKUP, ORG)).toMatchObject({ restored: false, reason: "That backup is not in a restorable format." });
    expect(rpcCalls).toHaveLength(0);
  });
});
