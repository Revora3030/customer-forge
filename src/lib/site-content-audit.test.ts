import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditHtml } from "@/lib/site-content-audit";
import { MAX_LINKS_PER_SITE, MAX_SITES_PER_RUN, auditSite, pickSitesForWeek, runSiteContentAudit, saveAuditRun } from "@/lib/site-content-audit.server";

const PAGE = "https://acme.example/";
const GOOD = `<html><head><title>Acme Plumbing</title><meta name="description" content="Plumbers in Raleigh"><script type="application/ld+json">{"@type":"LocalBusiness"}</script></head>
<body><h1>Acme</h1><img src="/a.jpg" alt="A van"><img src="/b.jpg" alt=""><a href="/services">Services</a><a href="https://other.example/x">Out</a><a href="mailto:a@b.co">Mail</a><a href="#top">Top</a></body></html>`;

describe("auditHtml", () => {
  it("passes a healthy page and returns only same-origin pages to check", () => {
    const { findings, internalLinks } = auditHtml(GOOD, PAGE);
    expect(findings).toEqual([]);
    expect(internalLinks).toEqual(["https://acme.example/services"]);
  });

  it("reports missing title, description and h1, bad structured data and images with no alt", () => {
    const bad = `<html><head><script type="application/ld+json">{oops</script></head><body><h1>a</h1><h1>b</h1><img src="x"><img src='y'></body></html>`;
    const checks = auditHtml(bad, PAGE).findings.map((f) => [f.check, f.severity]);
    expect(checks).toEqual(expect.arrayContaining([["title", "P1"], ["description", "P2"], ["h1", "P1"], ["json-ld", "P1"], ["image-alt", "P2"]]));
  });

  it("finds the description whichever way round the meta attributes are written", () => {
    const html = `<title>t</title><meta content="Hello there" name="description"><h1>x</h1>`;
    expect(auditHtml(html, PAGE).findings.map((f) => f.check)).not.toContain("description");
  });

  it("is bounded: only the first part of an enormous page is read", () => {
    const huge = "<title>t</title><h1>x</h1>" + "x".repeat(600_000) + "<h1>late</h1>";
    expect(auditHtml(huge, PAGE).findings.map((f) => f.check)).not.toContain("h1");
  });
});

const fakeFetch = (pages: Record<string, { status: number; body?: string }>): typeof fetch =>
  (async (url: string) => {
    const page = pages[String(url)];
    if (!page) throw new Error("network");
    return { ok: page.status < 400, status: page.status, text: async () => page.body ?? "" } as Response;
  }) as never;

describe("auditSite", () => {
  it("flags a broken internal link and an unreachable home page", async () => {
    const ok = await auditSite("acme", PAGE, fakeFetch({ [PAGE]: { status: 200, body: GOOD }, "https://acme.example/services": { status: 404 } }));
    expect(ok.findings).toEqual([{ check: "broken-link", severity: "P1", detail: "/services answered HTTP 404" }]);
    const down = await auditSite("acme", PAGE, fakeFetch({}));
    expect(down).toMatchObject({ reachable: false });
    expect(down.findings[0]?.detail).toContain("did not respond");
  });

  it("checks at most a few internal links per site", async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p</a>`).join("");
    const requested: string[] = [];
    const fetcher = (async (url: string) => { requested.push(String(url)); return { ok: true, status: 200, text: async () => `<title>t</title><meta name="description" content="d"><h1>x</h1>${links}` } as Response; }) as never;
    await auditSite("acme", PAGE, fetcher);
    expect(requested).toHaveLength(1 + MAX_LINKS_PER_SITE);
  });
});

describe("pickSitesForWeek", () => {
  const all = Array.from({ length: 100 }, (_, i) => i);
  it("is stable within a week, moves on the next, and returns everything when small", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(pickSitesForWeek(all, now)).toEqual(pickSitesForWeek(all, now + 3 * 86_400_000 > now ? now : now));
    expect(pickSitesForWeek(all, now)).toHaveLength(MAX_SITES_PER_RUN);
    expect(pickSitesForWeek(all, now)).not.toEqual(pickSitesForWeek(all, now + 7 * 86_400_000));
    expect(pickSitesForWeek([1, 2, 3], now)).toEqual([1, 2, 3]);
  });
});

/** Chainable fake that applies eq/in so tenant scoping and suspension are exercised. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      order: () => q,
      limit: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      insert: (row: Record<string, unknown>) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
      update: () => q,
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { db: { from } as never, inserts };
}

describe("runSiteContentAudit", () => {
  it("audits published sites, skips suspended workspaces, and uses the custom domain only when verified", async () => {
    const { db, inserts } = fakeDb({
      website_settings: [
        { organization_id: "a", published: true, custom_domain: "acme.example", domain_verified: true },
        { organization_id: "b", published: true, custom_domain: "unverified.example", domain_verified: false },
        { organization_id: "c", published: true, custom_domain: null, domain_verified: false },
        { organization_id: "d", published: false, custom_domain: "draft.example", domain_verified: true },
      ],
      organizations: [
        { id: "a", slug: "acme", is_suspended: false },
        { id: "b", slug: "beta", is_suspended: false },
        { id: "c", slug: "gamma", is_suspended: true },
        { id: "d", slug: "delta", is_suspended: false },
      ],
    });
    const requested: string[] = [];
    const fetcher = (async (url: string) => { requested.push(String(url)); return { ok: true, status: 200, text: async () => `<title>t</title><meta name="description" content="d"><h1>x</h1>` } as Response; }) as never;
    const run = await runSiteContentAudit(db, fetcher, Date.parse("2026-10-27T12:00:00Z"));
    expect(requested.sort()).toEqual(["https://acme.example", "https://revoragrowthsystems.com/s/beta"]);
    expect(run).toMatchObject({ scanned: 2, withProblems: 0, saved: 2 });
    const saved = inserts.find((item) => item.table === "site_content_audits")!.row as unknown as Record<string, unknown>[];
    expect(saved.map((row) => [row["organization_id"], row["url"], row["run_id"]])).toEqual([
      ["a", "https://acme.example", run.runId],
      ["b", "https://revoragrowthsystems.com/s/beta", run.runId],
    ]);
  });
});

describe("saveAuditRun", () => {
  it("stores counts and trimmed findings per site, skipping rows without a workspace or https url", async () => {
    const { db, inserts } = fakeDb({});
    const n = await saveAuditRun(db, "run-1", [
      { label: "acme", url: "https://acme.example", reachable: true, organizationId: "a", findings: [{ check: "title", severity: "P1", detail: "x".repeat(900) }, { check: "description", severity: "P2", detail: "no meta description" }] },
      { label: "no-org", url: "https://x.example", reachable: true, findings: [] },
      { label: "http", url: "http://y.example", reachable: true, organizationId: "b", findings: [] },
    ]);
    expect(n).toBe(1);
    const row = (inserts[0]!.row as unknown as Record<string, unknown>[])[0]!;
    expect(row).toMatchObject({ run_id: "run-1", organization_id: "a", p1_count: 1, p2_count: 1, reachable: true });
    expect(((row["findings"] as { detail: string }[])[0]!.detail).length).toBe(300);
  });

  it("never throws when the table is missing", async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: "42P01" } }) }) } as never;
    expect(await saveAuditRun(db, "run-1", [{ label: "a", url: "https://a.example", reachable: true, organizationId: "a", findings: [] }])).toBe(0);
  });
});

describe("adversarial: audit rows stay inside their workspace", () => {
  const sql = readFileSync("supabase/migrations/20261029152000_site_content_audits.sql", "utf8");
  it("has RLS on, server-only writes, and member-or-super-admin reads", () => {
    expect(sql).toMatch(/alter table public\.site_content_audits enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.site_content_audits from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on public\.site_content_audits to authenticated/i);
    expect(sql).not.toMatch(/grant (all|insert|update|delete)[^;]*site_content_audits[^;]*to (anon|authenticated)/i);
    expect(sql).not.toMatch(/for (all|insert|update|delete)/i);
    expect(sql).toMatch(/using \(private\.is_org_member\(organization_id\) or private\.is_super_admin\(\)\)/i);
    expect(sql).not.toMatch(/using \(true\)/i);
  });
});
