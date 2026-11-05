import { describe, expect, it } from "vitest";
import type { SiteModel } from "@/lib/builder/quality/video-site-model";
import { evaluatePostPublish, siteHasEnquiryForm, verificationByVersion, VERIFICATION_FIELD } from "@/lib/post-publish-verify";
import { publishedSiteModel, verifyLiveSite } from "@/lib/post-publish-verify.server";
import type { SmokeProbe, SmokeResult } from "@/lib/publish-smoke";

const LIVE_HTML = `<html><head><title>Acme Plumbing</title><link rel="stylesheet" href="/a.css"></head><body><h1>Acme Plumbing</h1><form><input name="name"></form>${"x".repeat(600)}<script type="module" async="" src="/assets/index-Bib7rSdW.js"></script></body></html>`;
const SMOKE_OK: SmokeResult = { status: "passed", checks: [{ path: "/", ok: true, problem: null, ms: 40 }] };
const PROFILE = { notification_email: "owner@acme.test", notify_on_lead: true };
const site = (heading = "Acme Plumbing", kind = "hero"): SiteModel => ({
  sections: [
    { id: "s1", pageSlug: "home", kind, heading, subheading: "Fast local repairs", body: "We fix leaks the same day.", composition: null, bgImage: null, components: [] },
    { id: "s2", pageSlug: "home", kind: "contact", heading: "Get a quote", components: [] },
  ],
});
const byId = (r: ReturnType<typeof evaluatePostPublish>, id: string) => r.checks.find((c) => c.id === id)!;

describe("evaluatePostPublish (TEN-06 item 25)", () => {
  it("passes when the page loads, alerts have an inbox, tracking is present and nothing covers the phone view", () => {
    const r = evaluatePostPublish({ smoke: SMOKE_OK, homeHtml: LIVE_HTML, profile: PROFILE, site: site() });
    expect(r[VERIFICATION_FIELD]).toBe("passed");
    expect(r.checks.map((c) => c.id)).toEqual(["live_page", "lead_recipient", "tracking", "mobile_overlay"]);
    expect(byId(r, "lead_recipient").detail).toContain("owner@acme.test");
  });

  it("uses the agreed field name verification_status with passed/failed only", () => {
    expect(VERIFICATION_FIELD).toBe("verification_status");
    const r = evaluatePostPublish({ smoke: null, homeHtml: null, profile: null, site: null });
    expect(r.verification_status).toBe("failed");
    expect(r.checks.every((c) => !c.ok)).toBe(true);
  });

  it("fails the live page check with the smoke problem", () => {
    const smoke: SmokeResult = { status: "failed", checks: [{ path: "/services", ok: false, problem: "HTTP 500", ms: 10 }] };
    const r = evaluatePostPublish({ smoke, homeHtml: LIVE_HTML, profile: PROFILE, site: site() });
    expect(byId(r, "live_page")).toMatchObject({ ok: false });
    expect(byId(r, "live_page").detail).toContain("/services: HTTP 500");
  });

  it("fails lead routing when there is no inbox or alerts are off", () => {
    expect(byId(evaluatePostPublish({ smoke: SMOKE_OK, homeHtml: LIVE_HTML, profile: {}, site: site() }), "lead_recipient").ok).toBe(false);
    const off = evaluatePostPublish({ smoke: SMOKE_OK, homeHtml: LIVE_HTML, profile: { ...PROFILE, notify_on_lead: false }, site: site() });
    expect(byId(off, "lead_recipient")).toMatchObject({ ok: false });
    expect(byId(off, "lead_recipient").detail).toMatch(/switched off/);
  });

  it("with a test lead, passes only when the alert went to the owner's own inbox", () => {
    const base = { smoke: SMOKE_OK, homeHtml: LIVE_HTML, profile: PROFILE, site: site() };
    expect(byId(evaluatePostPublish({ ...base, testLead: { alertedTo: "OWNER@acme.test" } }), "lead_recipient").ok).toBe(true);
    expect(byId(evaluatePostPublish({ ...base, testLead: { alertedTo: "someone@else.test" } }), "lead_recipient").ok).toBe(false);
    expect(byId(evaluatePostPublish({ ...base, testLead: { alertedTo: null } }), "lead_recipient").ok).toBe(false);
  });

  it("fails tracking when the live page carries no script", () => {
    const html = LIVE_HTML.replace(/<script[^]*<\/script>/, "");
    expect(byId(evaluatePostPublish({ smoke: SMOKE_OK, homeHtml: html, profile: PROFILE, site: site() }), "tracking").ok).toBe(false);
  });

  it("fails the phone overlay check when a loading counter is on the page", () => {
    const r = evaluatePostPublish({ smoke: SMOKE_OK, homeHtml: LIVE_HTML, profile: PROFILE, site: site("Loading 45%") });
    expect(byId(r, "mobile_overlay")).toMatchObject({ ok: false });
    expect(r.verification_status).toBe("failed");
  });

  it("finds an enquiry form from the live HTML or the site's sections", () => {
    expect(siteHasEnquiryForm(null, "<form></form>")).toBe(true);
    expect(siteHasEnquiryForm(site(), null)).toBe(true);
    expect(siteHasEnquiryForm({ sections: [{ id: "a", pageSlug: "home", kind: "hero" }] }, "<div></div>")).toBe(false);
  });
});

describe("verificationByVersion", () => {
  it("keeps the newest passed/failed per version and ignores pending/skipped", () => {
    const map = verificationByVersion([
      { version: 3, smoke_status: "failed", created_at: "2026-11-04T01:00:00Z" },
      { version: 3, smoke_status: "passed", created_at: "2026-11-04T02:00:00Z" },
      { version: 2, smoke_status: "skipped", created_at: "2026-11-03T01:00:00Z" },
      { version: 1, smoke_status: "failed", created_at: "2026-11-02T01:00:00Z" },
    ]);
    expect(map.get(3)).toBe("passed");
    expect(map.has(2)).toBe(false);
    expect(map.get(1)).toBe("failed");
  });
});

/** A tiny query-builder stand-in: every chain resolves to the table's canned row(s). */
function fakeDb(tables: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const result = { data: tables[table] ?? null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "order", "limit", "in"]) chain[m] = () => chain;
      chain["maybeSingle"] = () => Promise.resolve(result);
      chain["then"] = (resolve: (v: unknown) => unknown) => resolve(result);
      return chain;
    },
  };
}

const SNAPSHOT = {
  format: 1,
  takenAt: "2026-11-04T00:00:00Z",
  live_format: 1,
  pages: [
    {
      id: "p1", slug: "home", title: "Home", is_visible: true, sort_order: 0,
      sections: [{ id: "s1", kind: "hero", heading: "Acme Plumbing", subheading: null, body: "Same-day repairs.", settings: {}, is_visible: true, sort_order: 0, components: [] }],
    },
  ],
};

describe("verifyLiveSite (standalone, reused by PAI-19)", () => {
  it("fetches the live pages itself and checks the newest published version, sending nothing", async () => {
    const db = fakeDb({
      organizations: { slug: "acme", name: "Acme Plumbing" },
      website_settings: { custom_domain: null, dns_ok: false, ssl_ok: false },
      website_pages: [{ slug: "home", hidden: false, kind: "page" }],
      website_versions: { version: 7, pages: SNAPSHOT },
      business_profiles: PROFILE,
    });
    const fetched: string[] = [];
    const probe = async (url: string, path: string): Promise<SmokeProbe> => {
      fetched.push(`${url}${path}`);
      return { path, status: 200, contentType: "text/html", body: LIVE_HTML, ms: 5 };
    };
    const r = await verifyLiveSite(db as never, { organizationId: "00000000-0000-0000-0000-000000000001", platformOrigin: "https://example.test" }, probe);
    expect(fetched).toEqual(["https://example.test/s/acme/"]);
    expect(r.version).toBe(7);
    expect(r.verification_status).toBe("passed");
    expect(db.calls).not.toContain("leads");
  });

  it("fails cleanly when nothing has been published", async () => {
    const db = fakeDb({ organizations: { slug: "acme", name: "Acme" }, website_pages: [] });
    const probe = async (_url: string, path: string): Promise<SmokeProbe> => ({ path, status: 404, contentType: "text/html", body: "", ms: 1 });
    const r = await verifyLiveSite(db as never, { organizationId: "00000000-0000-0000-0000-000000000001", platformOrigin: "https://example.test" }, probe);
    expect(r.version).toBeNull();
    expect(r.verification_status).toBe("failed");
  });

  it("reads a stored published snapshot as a site model", () => {
    expect(publishedSiteModel(SNAPSHOT, null)?.sections.map((s) => s.id)).toEqual(["s1"]);
    expect(publishedSiteModel({ nope: true }, null)).toBeNull();
  });
});
