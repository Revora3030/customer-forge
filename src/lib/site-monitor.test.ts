import { describe, expect, it, vi } from "vitest";
import { diffFindings, findingsFor, hasNoindex, monitorMode, shouldEmail, EMAIL_GAP_MS, type ProbeResult } from "@/lib/site-monitor";
import { runSiteMonitor } from "@/lib/site-monitor.server";

vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: vi.fn(async () => ({ sent: true })) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OK: ProbeResult = { homeStatus: 200, homeError: null, certDaysLeft: 60, certError: null, sitemapStatus: 200, noindex: false };
const DOWN: ProbeResult = { ...OK, homeStatus: 503, homeError: "HTTP 503", sitemapStatus: null };

/** In-memory tables with just enough of the query builder for the monitor. */
function memoryDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const writes: string[] = [];
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let action: { kind: "select" | "update" | "upsert"; values?: Record<string, unknown> } = { kind: "select" };
    const rows = () => (tables[table] ??= []);
    const exec = () => {
      const match = rows().filter((r) => filters.every((f) => f(r)));
      if (action.kind === "update") {
        writes.push(`update ${table}`);
        for (const r of match) Object.assign(r, action.values);
      }
      if (action.kind === "upsert") {
        writes.push(`upsert ${table}`);
        const v = action.values!;
        const hit = rows().find((r) => r["organization_id"] === v["organization_id"] && r["host"] === v["host"] && r["check_key"] === v["check_key"]);
        if (hit) Object.assign(hit, v);
        else rows().push({ ...v });
      }
      return { data: match, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), chain),
      gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), chain),
      limit: () => chain,
      update: (values: Record<string, unknown>) => ((action = { kind: "update", values }), chain),
      upsert: (values: Record<string, unknown>) => ((action = { kind: "upsert", values }), Promise.resolve(exec())),
      maybeSingle: () => Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(exec()).then(resolve),
    };
    return chain;
  };
  return { db: { from } as never, writes, tables };
}

function world() {
  return memoryDb({
    website_settings: [
      { organization_id: ORG, custom_domain: "acme-plumbing.test", published: true, publish_state: "published", domain_verified: true },
      { organization_id: "draft", custom_domain: "draft.test", published: false, publish_state: "draft", domain_verified: true },
      { organization_id: "gone", custom_domain: "gone.test", published: true, publish_state: "published", domain_verified: true },
    ],
    organizations: [
      { id: ORG, subscription_status: "active" },
      { id: "gone", subscription_status: "canceled" },
    ],
    business_profiles: [{ organization_id: ORG, notification_email: "owner@acme-plumbing.test", notify_on_lead: true }],
    visitor_error_events: [],
    site_monitor_findings: [],
  });
}

describe("site monitor rules", () => {
  it("ships off; only dry_run and on enable it", () => {
    expect(monitorMode({})).toBe("off");
    expect(monitorMode({ SITE_MONITOR_MODE: "yes" })).toBe("off");
    expect(monitorMode({ SITE_MONITOR_MODE: "dry_run" })).toBe("dry_run");
    expect(monitorMode({ SITE_MONITOR_MODE: "ON" })).toBe("on");
  });

  it("writes plain sentences, not codes", () => {
    const [down] = findingsFor("a.test", DOWN);
    expect(down?.title).toBe("Your website isn't loading");
    expect(findingsFor("a.test", OK)).toEqual([]);
    expect(findingsFor("a.test", { ...OK, certDaysLeft: 3 })[0]?.detail).toContain("3 days");
    expect(findingsFor("a.test", { ...OK, noindex: true })[0]?.check).toBe("noindex_live");
    expect(findingsFor("a.test", OK, [{ message: "TypeError: x", today: 40 }])[0]?.check).toBe("visitor_errors");
  });

  it("emails only new problems, at most once per 24h", () => {
    const fresh = findingsFor("a.test", DOWN);
    expect(shouldEmail([], null, 0)).toBe(false);
    expect(shouldEmail(fresh, null, 0)).toBe(true);
    expect(shouldEmail(fresh, 1_000, 1_000 + EMAIL_GAP_MS - 1)).toBe(false);
    expect(shouldEmail(fresh, 1_000, 1_000 + EMAIL_GAP_MS)).toBe(true);
    expect(diffFindings([{ check: "home_down", state: "seen" }], fresh).fresh).toEqual([]);
  });

  it("detects noindex in meta or header", () => {
    expect(hasNoindex('<meta name="robots" content="noindex, nofollow">', null)).toBe(true);
    expect(hasNoindex('<meta name="description" content="noindex">', null)).toBe(false);
    expect(hasNoindex("", "noindex")).toBe(true);
  });
});

describe("runSiteMonitor", () => {
  it("does nothing when off", async () => {
    const w = world();
    const probe = vi.fn(async () => DOWN);
    const run = await runSiteMonitor(w.db, { mode: "off", probe });
    expect(probe).not.toHaveBeenCalled();
    expect(run.scanned).toBe(0);
  });

  it("a failing site gives exactly one finding and one email; the second run gives none", async () => {
    const w = world();
    const send = vi.fn(async () => true);
    const probe = vi.fn(async () => DOWN);
    const now = Date.parse("2026-11-05T12:00:00Z");
    const first = await runSiteMonitor(w.db, { mode: "on", probe, send, now });
    expect(probe).toHaveBeenCalledTimes(1); // draft and cancelled sites are never probed
    expect(probe).toHaveBeenCalledWith("acme-plumbing.test");
    expect(w.tables["site_monitor_findings"]).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    const [[mail]] = send.mock.calls as unknown as [[{ recipient: string; message: string }]];
    expect(mail.recipient).toBe("owner@acme-plumbing.test");
    expect(mail.message).toContain("/app/domain?finding=home_down");
    expect(first.findings).toEqual([{ host: "acme-plumbing.test", check: "home_down", fresh: true }]);

    await runSiteMonitor(w.db, { mode: "on", probe, send, now: now + 3_600_000 });
    expect(w.tables["site_monitor_findings"]).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a second new problem within 24h is stored but not emailed; fixed problems are marked fixed", async () => {
    const w = world();
    const send = vi.fn(async () => true);
    const now = Date.parse("2026-11-05T12:00:00Z");
    await runSiteMonitor(w.db, { mode: "on", probe: async () => DOWN, send, now });
    await runSiteMonitor(w.db, { mode: "on", probe: async () => ({ ...OK, noindex: true }), send, now: now + 3_600_000 });
    expect(send).toHaveBeenCalledTimes(1);
    const rows = w.tables["site_monitor_findings"]!;
    expect(rows.find((r) => r["check_key"] === "home_down")?.["state"]).toBe("fixed");
    expect(rows.find((r) => r["check_key"] === "noindex_live")?.["state"]).toBe("new");
  });

  it("turns a LOV-4 visitor error spike into a finding", async () => {
    const w = world();
    w.tables["visitor_error_events"]!.push({ organization_id: ORG, day: "2026-11-05", kind: "js", message_hash: "abcd", message: "TypeError: menu", page_path: "/", occurrences: 30, last_seen: "2026-11-05T11:00:00Z" });
    const run = await runSiteMonitor(w.db, { mode: "dry_run", probe: async () => OK, now: Date.parse("2026-11-05T12:00:00Z") });
    expect(run.findings.map((f) => f.check)).toEqual(["visitor_errors"]);
  });

  it("dry run lists what it would send without writing or sending", async () => {
    const w = world();
    const send = vi.fn(async () => true);
    const run = await runSiteMonitor(w.db, { mode: "dry_run", probe: async () => DOWN, send });
    expect(send).not.toHaveBeenCalled();
    expect(w.writes).toEqual([]);
    expect(run.wouldEmail).toEqual([{ host: "acme-plumbing.test", recipient: "owner@acme-plumbing.test", heading: "Your website isn't loading" }]);
  });
});
