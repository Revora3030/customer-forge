import { describe, expect, it, vi } from "vitest";
import { runSiteHostingSweep } from "./site-hosting.server";

type Row = Record<string, unknown>;
const NOW = new Date("2026-10-30T12:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

/** Minimal in-memory PostgREST stand-in for the calls the sweep makes. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let op: "select" | "update" | "delete" | "upsert" = "select";
    let patch: Row = {};
    const preds: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ??= []);
    const run = () => {
      const hit = rows().filter((r) => preds.every((p) => p(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r));
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      range: (a: number, b: number) => Promise.resolve({ data: run().data.slice(a, b + 1), error: null }),
      eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), chain),
      in: (c: string, v: unknown[]) => (preds.push((r) => v.includes(r[c])), chain),
      is: (c: string, v: unknown) => (preds.push((r) => (r[c] ?? null) === v), chain),
      not: (c: string) => (preds.push((r) => r[c] != null), chain),
      lte: (c: string, v: string) => (preds.push((r) => String(r[c]) <= v), chain),
      update: (p: Row) => ((op = "update"), (patch = p), chain),
      delete: () => ((op = "delete"), chain),
      upsert: (row: Row) => {
        if (!rows().some((r) => r["organization_id"] === row["organization_id"])) rows().push({ warning_sent_at: null, offline_at: null, ...row });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return chain;
  };
  return { from };
}

describe("site hosting sweep", () => {
  it("creates grace rows, warns once for published sites, takes due sites offline and restores resubscribed ones", async () => {
    const tables: Record<string, Row[]> = {
      subscriptions: [
        { organization_id: "new", status: "canceled", current_period_end: at(-1), provider_subscription_id: "s1", environment: "live", payment_provider: "stripe" },
        { organization_id: "warn", status: "canceled", current_period_end: at(-12), provider_subscription_id: "s2", environment: "live", payment_provider: "stripe" },
        { organization_id: "due", status: "canceled", current_period_end: at(-15), provider_subscription_id: "s3", environment: "live", payment_provider: "stripe" },
        { organization_id: "back", status: "active", current_period_end: at(20), provider_subscription_id: "s4", environment: "live", payment_provider: "stripe" },
      ],
      site_hosting_grace: [
        { organization_id: "warn", ended_at: at(-12), offline_after: at(2), warning_sent_at: null, offline_at: null },
        { organization_id: "due", ended_at: at(-15), offline_after: at(-1), warning_sent_at: at(-4), offline_at: null },
        { organization_id: "back", ended_at: at(-30), offline_after: at(-16), warning_sent_at: at(-19), offline_at: at(-16) },
      ],
      organizations: [{ id: "new" }, { id: "warn" }, { id: "due" }, { id: "back" }],
      website_settings: [{ organization_id: "warn", published: true }],
    };
    const warn = vi.fn(async () => true);
    const db = fakeDb(tables);

    const result = await runSiteHostingSweep(db as never, { warn, now: () => NOW });
    expect(result).toEqual({ created: 1, restored: 1, warned: 1, offline: 1, errors: 0 });
    expect(warn).toHaveBeenCalledWith("warn", at(3));
    const grace = Object.fromEntries(tables["site_hosting_grace"]!.map((r) => [r["organization_id"], r]));
    expect(grace["back"]).toBeUndefined();
    expect(grace["new"]).toMatchObject({ offline_after: at(13), offline_at: null });
    expect(grace["due"]!["offline_at"]).toBe(NOW.toISOString());
    expect(grace["warn"]!["warning_sent_at"]).toBe(NOW.toISOString());

    const again = await runSiteHostingSweep(db as never, { warn, now: () => NOW });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ created: 0, restored: 0, warned: 0, offline: 0, errors: 0 });
  });

  it("releases the warning claim when the email fails, so the site is not taken down unwarned", async () => {
    const tables: Record<string, Row[]> = {
      subscriptions: [{ organization_id: "w", status: "canceled", current_period_end: at(-12), provider_subscription_id: "s", environment: "live", payment_provider: "stripe" }],
      site_hosting_grace: [{ organization_id: "w", ended_at: at(-12), offline_after: at(2), warning_sent_at: null, offline_at: null }],
      organizations: [{ id: "w" }],
      website_settings: [{ organization_id: "w", published: true }],
    };
    const result = await runSiteHostingSweep(fakeDb(tables) as never, {
      warn: async () => {
        throw new Error("mail down");
      },
      now: () => NOW,
    });
    expect(result.errors).toBe(1);
    expect(tables["site_hosting_grace"]![0]!["warning_sent_at"]).toBeNull();
  });
});
