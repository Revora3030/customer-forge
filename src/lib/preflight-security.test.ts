import { describe, expect, it } from "vitest";
import { scanText, scanPagesForRiskyCode } from "@/lib/preflight-code-scan";
import { missingSecurityHeaders, securityCheck } from "@/lib/preflight-security";
import { preflight, type PreflightInput } from "@/lib/preflight";
import type { ContentPage } from "@/lib/website-content";

// Fixture "keys" are assembled at run time so no scanner sees a real-looking
// token in the source. None of them is a real credential.
const rand = (n: number) => "aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zC".repeat(3).slice(0, n);
const STRIPE_SECRET = ["sk", "live", rand(24)].join("_");
const AWS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
const GOOGLE_KEY = "AI" + "za" + rand(35);
const GITHUB_TOKEN = "gh" + "p_" + rand(36);
const jwt = (role: string) => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase" })}.${rand(30)}`;
};

const place = { pageTitle: "Contact", where: 'the "Get in touch" section' };

const section = (over: Partial<ContentPage["sections"][number]> = {}) => ({
  id: "s1",
  page_id: "p1",
  kind: "contact",
  variant: "default",
  heading: "Get in touch",
  subheading: null,
  body: null,
  settings: null,
  sort_order: 0,
  is_visible: true,
  components: [],
  ...over,
});

const page = (sections: ContentPage["sections"], over: Partial<ContentPage> = {}): ContentPage => ({
  id: "p1",
  slug: "contact",
  title: "Contact",
  kind: "contact",
  sort_order: 0,
  is_visible: true,
  seo_title: "Contact",
  seo_description: "Contact us.",
  seo_canonical: null,
  og_title: null,
  og_description: null,
  og_image_url: null,
  noindex: false,
  sections,
  ...over,
});

describe("secrets (blockers)", () => {
  it.each([
    ["Stripe secret key", `key: ${STRIPE_SECRET}`],
    ["AWS access key", `id ${AWS_KEY}`],
    ["GitHub token", `token ${GITHUB_TOKEN}`],
    ["private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIB"],
    ["Supabase service-role key", `const k = "${jwt("service_role")}"`],
  ])("flags %s as a blocker and never repeats it", (_name, text) => {
    const found = scanText(text, place);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("blocker");
    expect(JSON.stringify(found)).not.toContain(rand(24));
  });

  it("does not flag an anon-role JWT, placeholders, publishable keys or normal prose", () => {
    expect(scanText(`anon ${jwt("anon")}`, place)).toEqual([]);
    expect(scanText(["sk", "live", "x".repeat(24)].join("_"), place)).toEqual([]);
    expect(scanText("pk_live_" + rand(24), place)).toEqual([]);
    expect(scanText("We offer desk-organizer-ideas-for-small-spaces-and-offices cleaning.", place)).toEqual([]);
    expect(scanText("Call us on 919-555-0100 for a free quote.", place)).toEqual([]);
  });

  it("warns, not blocks, on a Google key and on a generic secret assignment", () => {
    const g = scanText(`maps ${GOOGLE_KEY}`, place);
    expect(g[0]).toMatchObject({ kind: "secret-key-maybe", severity: "warning" });
    const generic = scanText(`api_key = "${rand(28)}"`, place);
    expect(generic[0]).toMatchObject({ severity: "warning" });
  });
});

describe("risky scripts, forms and frames (warnings)", () => {
  it("flags inline scripts and click handlers", () => {
    expect(scanText("<script>alert(1)</script>", place)[0]).toMatchObject({ kind: "inline-script", severity: "warning" });
    expect(scanText('<a href="#" onclick="go()">x</a>', place)[0]).toMatchObject({ kind: "inline-script" });
  });

  it("flags a script from an unknown host but not a trusted one", () => {
    const bad = scanText('<script src="https://evil.example.net/x.js"></script>', place);
    expect(bad[0]).toMatchObject({ kind: "unknown-script-host", host: "evil.example.net", severity: "warning" });
    expect(scanText('<script src="https://js.stripe.com/v3/"></script>', place)).toEqual([]);
  });

  it("flags a form posting off-site but not to the site itself or a relative path", () => {
    const off = scanText('<form action="https://collector.example.org/in" method="post">', place, { publicHost: "elite.test" });
    expect(off[0]).toMatchObject({ kind: "offsite-form", host: "collector.example.org" });
    expect(scanText('<form action="https://www.elite.test/thanks">', place, { publicHost: "elite.test" })).toEqual([]);
    expect(scanText('<form action="/thanks">', place)).toEqual([]);
    expect(scanText('<form action="https://app.revoragrowthsystems.com/f">', place)).toEqual([]);
  });

  it("flags a frame from an unknown host but not a supported embed", () => {
    expect(scanText('<iframe src="https://sketchy.example.io/w"></iframe>', place)[0]).toMatchObject({ kind: "unknown-frame-host" });
    expect(scanText('<iframe src="https://calendly.com/elite/30min"></iframe>', place)).toEqual([]);
  });
});

describe("mixed content (blocker)", () => {
  it("flags http:// assets but not a clickable http link", () => {
    expect(scanText('<img src="http://cdn.example.com/a.png">', place)[0]).toMatchObject({ kind: "mixed-content", severity: "blocker" });
    expect(scanText("background: url(http://cdn.example.com/a.png)", place)[0]).toMatchObject({ kind: "mixed-content" });
    expect(scanText('<a href="http://old.example.com">our old site</a>', place)).toEqual([]);
    expect(scanText('<img src="https://cdn.example.com/a.png">', place)).toEqual([]);
  });

  it("flags a stored http:// media url on a component", () => {
    const comp = { id: "c", section_id: "s1", kind: "image", label: null, body: null, media_url: "http://x.example.com/a.jpg", link_url: null, link_label: null, settings: null, sort_order: 0, is_visible: true };
    const f = scanPagesForRiskyCode([page([section({ components: [comp] })])]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "mixed-content", severity: "blocker" });
  });
});

describe("scanning pages", () => {
  it("names the page and the block, reads settings, skips hidden sections, and dedupes", () => {
    const pages = [
      page([
        section({ body: `Use ${STRIPE_SECRET}`, settings: { embed: { note: `again ${STRIPE_SECRET}` } } }),
        section({ id: "s2", heading: "Hidden", is_visible: false, body: `Use ${STRIPE_SECRET}` }),
      ]),
    ];
    const f = scanPagesForRiskyCode(pages);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ pageTitle: "Contact", where: 'the "Get in touch" section', severity: "blocker" });
  });
});

describe("securityCheck result line", () => {
  it("passes on clean pages (headers skipped, not claimed)", () => {
    const check = securityCheck([page([section({ body: "Call us today." })])]);
    expect(check).toMatchObject({ passed: true, count: 0, line: "Security check: passed", headersChecked: false });
  });

  it("counts things to fix, with LOV-5 card props on every item", () => {
    const check = securityCheck([page([section({ body: `${STRIPE_SECRET} <script>x()</script>` })])]);
    expect(check.passed).toBe(false);
    expect(check.line).toBe("Security check: 2 things to fix");
    expect(check.blockers).toBe(1);
    for (const item of check.items) {
      expect(item.title).toBeTruthy();
      expect(item.plainReason).toContain("Contact");
      expect(item.scope).toBe("page:contact");
    }
    expect(securityCheck([page([section({ body: "<script>x()</script>" })])]).line).toBe("Security check: 1 thing to fix");
  });

  it("checks served headers only when given them", () => {
    const good = { "Strict-Transport-Security": "max-age=1", "Content-Security-Policy": "default-src 'self'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
    expect(securityCheck([], { servedHeaders: good })).toMatchObject({ passed: true, headersChecked: true });
    const bad = securityCheck([], { servedHeaders: { "x-content-type-options": "nosniff" } });
    expect(bad).toMatchObject({ passed: false, headersChecked: true, count: 1 });
    expect(bad.items[0]!.severity).toBe("warning");
    expect(missingSecurityHeaders({})).toHaveLength(4);
  });
});

describe("Pre-Flight integration", () => {
  const input = (pages: ContentPage[]): PreflightInput => ({
    pages, businessName: "Elite", phone: "919-555-0100", email: "hi@elite.test", city: "Raleigh",
    serviceArea: "Wake", description: "Detailing", hasHours: true, servicesCount: 2, pricedServicesCount: 1,
    bookableCount: 1, quoteFormCount: 1, quoteQuestionCount: 3, mediaCount: 3, analyticsConfigured: true,
    notifiesOwner: true, followUpAutomations: 1, seoTitle: "t", seoDescription: "d", publicHost: "elite.test",
    httpsVerified: true, canPublish: true,
  });
  const find = (r: ReturnType<typeof preflight>, key: string) => r.checks.find((c) => c.key === key)!;

  it("an exposed key blocks publishing; names the block; never shows the key", () => {
    const r = preflight(input([page([section({ body: `key ${STRIPE_SECRET}` })])]));
    expect(find(r, "exposed-keys")).toMatchObject({ status: "fail", severity: "blocker" });
    expect(find(r, "exposed-keys").detail).toContain('the "Get in touch" section');
    expect(JSON.stringify(r)).not.toContain(rand(24));
    expect(r.publishSafe).toBe(false);
    expect(r.securityCheck.line).toBe("Security check: 1 thing to fix");
  });

  it("an off-site form only warns; publishing stays allowed", () => {
    const r = preflight(input([page([section({ body: '<form action="https://collector.example.org/x">' })])]));
    expect(find(r, "exposed-keys").status).toBe("pass");
    expect(find(r, "risky-code")).toMatchObject({ status: "warn", severity: "warning" });
    expect(r.blockers.filter((b) => b.key === "risky-code")).toEqual([]);
    expect(r.securityCheck.blockers).toBe(0);
  });

  it("clean pages pass both checks", () => {
    const r = preflight(input([page([section({ body: "Friendly local detailing." })])]));
    expect(find(r, "exposed-keys").status).toBe("pass");
    expect(find(r, "risky-code").status).toBe("pass");
    expect(r.securityCheck.line).toBe("Security check: passed");
  });
});
