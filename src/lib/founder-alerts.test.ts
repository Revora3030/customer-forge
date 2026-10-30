import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const sent: { name: string; key: string | undefined; data: Record<string, unknown> | undefined }[] =
  [];
vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(
    async (
      name: string,
      _to: string,
      opts: { idempotencyKey?: string; templateData?: Record<string, unknown> },
    ) => {
      sent.push({ name, key: opts.idempotencyKey, data: opts.templateData });
      return { ok: true };
    },
  ),
}));

import {
  FOUNDER_ALERT_ENTITY,
  FOUNDER_ALERT_HOURLY_CAP,
  alertRecentBuildOutcomes,
  sendFounderAlert,
} from "./founder-alerts.server";

type Row = Record<string, unknown>;

/** Tiny in-memory stand-in for the few query shapes the helper uses. */
function fakeDb(seed: { audit?: Row[]; jobs?: Row[]; orgs?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    audit_logs: seed.audit ?? [],
    generation_jobs: seed.jobs ?? [],
    organizations: seed.orgs ?? [],
  };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    let limit = Infinity;
    const rows = () =>
      (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
    const q = {
      select: (_cols: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => {
        (tables[table] ??= []).push({ created_at: new Date().toISOString(), ...row });
        return { error: null };
      },
      then: (resolve: (v: unknown) => void) =>
        resolve(head ? { count: rows().length, error: null } : { data: rows(), error: null }),
    };
    return q;
  };
  return { db: { from } as never, tables };
}

const alert = (marker: string) => ({
  kind: "payment_failed" as const,
  marker,
  organizationId: "org-1",
  title: "Payment failed",
});

beforeEach(() => {
  sent.length = 0;
});

describe("founder alerts", () => {
  it("sends once per event marker", async () => {
    const { db } = fakeDb();
    expect(await sendFounderAlert(db, alert("payment-failed:in_1:1"))).toBe("sent");
    expect(await sendFounderAlert(db, alert("payment-failed:in_1:1"))).toBe("duplicate");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ name: "founder-alert", key: "founder:payment-failed:in_1:1" });
  });

  it("throttles to the hourly cap", async () => {
    const now = new Date().toISOString();
    const audit = Array.from({ length: FOUNDER_ALERT_HOURLY_CAP }, (_, i) => ({
      entity: FOUNDER_ALERT_ENTITY,
      entity_id: `x:${i}`,
      created_at: now,
    }));
    const { db } = fakeDb({ audit });
    expect(await sendFounderAlert(db, alert("payment-failed:in_2:1"))).toBe("throttled");
    expect(sent).toHaveLength(0);
  });

  it("alerts recent finished and failed builds once each", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const { db } = fakeDb({
      jobs: [
        { id: "j1", organization_id: "org-1", status: "completed", completed_at: recent },
        {
          id: "j2",
          organization_id: "org-1",
          status: "failed",
          failure_kind: "timeout",
          completed_at: recent,
        },
        { id: "j3", organization_id: "org-1", status: "failed", completed_at: old },
        { id: "j4", organization_id: "org-1", status: "running", completed_at: null },
      ],
      orgs: [{ id: "org-1", name: "Harbor Line Plumbing", is_demo: false }],
    });
    expect(await alertRecentBuildOutcomes(db)).toBe(2);
    expect(await alertRecentBuildOutcomes(db)).toBe(0);
    expect(sent.map((s) => s.data?.["title"])).toEqual([
      "Website build finished",
      "Website build failed",
    ]);
  });

  it("is wired into payment failure, the build worker and the template registry", () => {
    const lifecycle = readFileSync("src/lib/billing-lifecycle.server.ts", "utf8");
    expect(lifecycle).toMatch(/kind: "payment_failed"/);
    const worker = readFileSync("src/routes/api/public/jobs/site-engine.ts", "utf8");
    expect(worker).toContain("alertRecentBuildOutcomes");
    const registry = readFileSync("src/lib/email-templates/registry.ts", "utf8");
    expect(registry).toContain('"founder-alert": founderAlertTemplate');
    // Existing founder alerts for signups and completed payments stay in place.
    expect(readFileSync("src/lib/platform-funnel.functions.ts", "utf8")).toContain(
      '"new-signup-alert"',
    );
    expect(lifecycle).toContain('"billing-sale-alert"');
  });
});
