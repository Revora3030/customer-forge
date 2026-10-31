import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildLeadReviewDraft,
  validateLeadReviewDraftInput,
  type LeadReviewDraftDeps,
} from "@/lib/lead-review-draft.server";
import { mailtoHref, smsHref } from "@/lib/lead-review-draft";
import type { ConsentLookups } from "@/lib/automation-consent";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const LEAD = "55555555-5555-4555-8555-555555555555";

type Call = { table: string; op: string; args: unknown[] };
function fakeDb(results: Record<string, unknown>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      let first = "";
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "in", "lte", "not", "order", "limit", "maybeSingle", "single"]) {
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          calls.push({ table, op, args });
          return chain;
        };
      }
      chain["then"] = (resolve: (value: unknown) => unknown) => {
        const key = `${table}:${first}`;
        return resolve(key in results ? results[key] : { data: first === "select" ? [] : null, error: null });
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const lead = (over: Record<string, unknown> = {}) => ({
  id: LEAD,
  name: "Pat Lee",
  email: "pat@example.com",
  phone: "+15125550100",
  status: "completed",
  ...over,
});

const base = (over: Record<string, unknown> = {}) => ({
  "memberships:select": { data: { role: "staff" }, error: null },
  "organizations:select": { data: { id: ORG, name: "Acme Wash" }, error: null },
  "business_profiles:select": {
    data: { email: "owner@acme.test", owner_email: null, state: "TX", review_link: "https://g.page/acme" },
    error: null,
  },
  "leads:select": { data: lead(), error: null },
  "appointments:select": { data: [], error: null },
  ...over,
});

const consenting = () => ({
  isDoNotContact: vi.fn(async () => false),
  hasSmsConsent: vi.fn(async () => true),
  smsAllowedAt: vi.fn(() => true),
});
const depsFor = (lookups: ConsentLookups): LeadReviewDraftDeps => ({
  lookups: () => lookups,
  now: () => new Date("2026-10-31T17:00:00Z"),
});
const input = { organizationId: ORG, leadId: LEAD };

const writes = (calls: Call[]) => calls.filter((c) => ["insert", "update", "upsert", "delete"].includes(c.op));

describe("review draft for a completed lead with no booking", () => {
  it("returns wording for the owner to send, with their own mail and messages links", async () => {
    const { db, calls } = fakeDb(base());
    const result = await buildLeadReviewDraft(db, USER, input, depsFor(consenting()));
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    const [email, sms] = result.drafts;
    expect(email).toMatchObject({ channel: "email", allowed: true, recipient: "pat@example.com" });
    expect(sms).toMatchObject({ channel: "sms", allowed: true, recipient: "+15125550100" });
    if (!email?.allowed || !sms?.allowed) return;
    expect(email.subject).toBe("How did we do, Pat?");
    expect(email.body).toContain("https://g.page/acme");
    expect(email.href.startsWith("mailto:pat%40example.com?subject=")).toBe(true);
    expect(sms.href.startsWith("sms:+15125550100?&body=")).toBe(true);
    expect(result.needsReviewLink).toBe(false);
    // Read-only: no row of any table was written, in particular no automation run.
    expect(writes(calls)).toEqual([]);
    expect(calls.some((c) => c.table === "automation_runs")).toBe(false);
  });

  it("never calls anything that sends: only read-only consent lookups are used", async () => {
    const lookups = consenting();
    const { db } = fakeDb(base());
    await buildLeadReviewDraft(db, USER, input, depsFor(lookups));
    // The deps contain no delivery function at all; the consent reads are the only outside calls.
    expect(Object.keys(depsFor(lookups)).sort()).toEqual(["lookups", "now"]);
    expect(lookups.isDoNotContact).toHaveBeenCalled();
    expect(lookups.hasSmsConsent).toHaveBeenCalledWith("+15125550100");
  });

  it("keeps the do-not-contact check: a suppressed person is offered no draft on that channel", async () => {
    const lookups = { ...consenting(), isDoNotContact: vi.fn(async (v: string) => v === "pat@example.com") };
    const { db, calls } = fakeDb(base());
    const result = await buildLeadReviewDraft(db, USER, input, depsFor(lookups));
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.drafts[0]).toEqual({ channel: "email", allowed: false, reason: "recipient_suppressed" });
    expect(result.drafts[1]?.allowed).toBe(true);
    expect(writes(calls)).toEqual([]);
  });

  it("keeps the SMS opt-in check for review requests", async () => {
    const lookups = { ...consenting(), hasSmsConsent: vi.fn(async () => false) };
    const result = await buildLeadReviewDraft(fakeDb(base()).db, USER, input, depsFor(lookups));
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.drafts[1]).toEqual({ channel: "sms", allowed: false, reason: "sms_no_opt_in" });
  });

  it("keeps the US/Canada-only and quiet-hours rules for texts", async () => {
    const intl = fakeDb(base({ "leads:select": { data: lead({ phone: "+447700900123" }), error: null } }));
    const a = await buildLeadReviewDraft(intl.db, USER, input, depsFor(consenting()));
    if (!a.eligible) throw new Error("expected eligible");
    expect(a.drafts[1]).toEqual({ channel: "sms", allowed: false, reason: "sms_region_unsupported" });

    const quiet = { ...consenting(), smsAllowedAt: vi.fn(() => false) };
    const b = await buildLeadReviewDraft(fakeDb(base()).db, USER, input, depsFor(quiet));
    if (!b.eligible) throw new Error("expected eligible");
    expect(b.drafts[1]).toEqual({ channel: "sms", allowed: false, reason: "sms_quiet_hours" });
    expect(b.drafts[0]?.allowed).toBe(true);
  });

  it("holds the draft back when the consent list can't be read", async () => {
    const lookups = { ...consenting(), isDoNotContact: vi.fn(async () => { throw new Error("db down"); }) };
    const result = await buildLeadReviewDraft(fakeDb(base()).db, USER, input, depsFor(lookups));
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.drafts.map((d) => d.allowed)).toEqual([false, false]);
    expect(result.drafts[0]).toEqual({ channel: "email", allowed: false, reason: "consent_lookup_unavailable" });
  });

  it("offers no draft for a channel the lead has no contact detail for", async () => {
    const { db } = fakeDb(base({ "leads:select": { data: lead({ email: null, phone: " " }), error: null } }));
    const result = await buildLeadReviewDraft(db, USER, input, depsFor(consenting()));
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.drafts).toEqual([
      { channel: "email", allowed: false, reason: "no_contact" },
      { channel: "sms", allowed: false, reason: "no_contact" },
    ]);
  });

  it("says so when no review link is saved", async () => {
    const { db } = fakeDb(base({
      "business_profiles:select": { data: { email: null, owner_email: null, state: "TX", review_link: null }, error: null },
    }));
    const result = await buildLeadReviewDraft(db, USER, input, depsFor(consenting()));
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.needsReviewLink).toBe(true);
  });
});

describe("who and what is eligible", () => {
  it("only a Completed lead gets a draft", async () => {
    for (const status of ["new", "contacted", "qualified", "quoted", "booked", "lost"]) {
      const { db, calls } = fakeDb(base({ "leads:select": { data: lead({ status }), error: null } }));
      const lookups = consenting();
      expect(await buildLeadReviewDraft(db, USER, input, depsFor(lookups))).toEqual({ eligible: false, reason: "not_completed" });
      expect(lookups.isDoNotContact).not.toHaveBeenCalled();
      expect(writes(calls)).toEqual([]);
    }
  });

  it("a lead with a booking is asked through that booking, not here", async () => {
    const { db } = fakeDb(base({ "appointments:select": { data: [{ id: "a1" }], error: null } }));
    const lookups = consenting();
    expect(await buildLeadReviewDraft(db, USER, input, depsFor(lookups))).toEqual({ eligible: false, reason: "has_booking" });
    expect(lookups.isDoNotContact).not.toHaveBeenCalled();
  });

  it("refuses anyone below staff before reading the lead", async () => {
    const { db, calls } = fakeDb(base({ "memberships:select": { data: { role: "viewer" }, error: null } }));
    await expect(buildLeadReviewDraft(db, USER, input, depsFor(consenting()))).rejects.toThrow(/permission/);
    expect(calls.some((c) => c.table === "leads")).toBe(false);
  });

  it("a lead from another workspace is 'not found'", async () => {
    const { db } = fakeDb(base({ "leads:select": { data: null, error: null } }));
    await expect(buildLeadReviewDraft(db, USER, input, depsFor(consenting()))).rejects.toThrow(/wasn't found/);
  });

  it("validates ids and ignores any recipient or body the browser sends", () => {
    expect(validateLeadReviewDraftInput({ organizationId: ORG, leadId: LEAD, recipient: "x@y.z", body: "hi" })).toEqual(input);
    expect(() => validateLeadReviewDraftInput({ organizationId: "x", leadId: LEAD })).toThrow(/workspace/);
    expect(() => validateLeadReviewDraftInput({ organizationId: ORG, leadId: "nope" })).toThrow(/lead/);
  });
});

describe("links that open the owner's own apps", () => {
  it("encodes the draft and strips a phone number down to digits", () => {
    expect(mailtoHref("a@b.co", "Hi & bye", "Line 1\nLine 2")).toBe("mailto:a%40b.co?subject=Hi%20%26%20bye&body=Line%201%0ALine%202");
    expect(smsHref("(512) 555-0100", "Hello there")).toBe("sms:5125550100?&body=Hello%20there");
    expect(smsHref("+1 512 555 0100", "x")).toBe("sms:+15125550100?&body=x");
  });
});

describe("nothing in the draft feature can send, queue or save", () => {
  const files = [
    "src/lib/lead-review-draft.ts",
    "src/lib/lead-review-draft.server.ts",
    "src/lib/lead-review-draft.functions.ts",
    "src/components/app/LeadReviewDraftPanel.tsx",
  ];
  const forbidden =
    /deliverRun|deliverEmail|deliverSms|sendTemplateEmail|enqueueAutomations|processDueRuns|queueAutomationEvent|requestReviewFor|automation_runs|twilio|fetch\(|\.(insert|update|upsert|delete|rpc)\(/i;

  it.each(files)("%s has no send, queue or write call", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(forbidden);
  });

  it("the panel only copies text or links to the owner's own apps", () => {
    const panel = readFileSync("src/components/app/LeadReviewDraftPanel.tsx", "utf8");
    expect(panel).toMatch(/navigator\.clipboard\.writeText/);
    expect(panel).toMatch(/href=\{d\.href\}/);
    expect(panel).toMatch(/getLeadReviewDraft\(/);
  });

  it("the Leads page shows the panel only for a Completed lead", () => {
    const page = readFileSync("src/routes/_authenticated/app.leads.tsx", "utf8");
    expect(page).toMatch(/selected\.status === "completed" \?[\s\S]{0,120}<LeadReviewDraftPanel/);
  });
});
