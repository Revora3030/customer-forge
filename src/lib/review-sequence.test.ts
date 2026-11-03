import React from "react";
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  REVIEW_SEQUENCE_STEPS,
  cleanFeedback,
  feedbackUrl,
  feedbackUrlFromBody,
  isFeedbackToken,
  newFeedbackToken,
  parseRating,
  reviewSequenceMessages,
  routeForRating,
  safeReviewUrl,
} from "@/lib/review-sequence";
import { queueAutomationEventFor, skipQueuedReviewRuns, startReviewSequence } from "@/lib/automation-queue.server";
import { recordFeedbackRating, recordPrivateFeedback, loadFeedbackView } from "@/lib/review-feedback.server";
import { template as reviewRequestTemplate } from "@/lib/email-templates/review-request";
import { TEMPLATES } from "@/lib/email-templates/registry";

const ORG = "11111111-1111-4111-8111-111111111111";
const APPT = "44444444-4444-4444-8444-444444444444";
const LEAD = "55555555-5555-4555-8555-555555555555";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";
const NOW = Date.parse("2026-11-02T15:00:00Z");

/* ---- recording Supabase double: results keyed by "table:firstOp" (or a function of the calls) ---- */
type Call = { table: string; op: string; args: unknown[] };
function fakeDb(results: Record<string, unknown>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      let first = "";
      const mine: Call[] = [];
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "eq", "in", "is", "limit", "maybeSingle"]) {
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          const call = { table, op, args };
          calls.push(call);
          mine.push(call);
          return chain;
        };
      }
      chain["then"] = (resolve: (value: unknown) => unknown) => {
        const key = `${table}:${first}`;
        const value = key in results ? results[key] : { data: first === "select" ? [] : null, error: null };
        return resolve(typeof value === "function" ? (value as (c: Call[]) => unknown)(mine) : value);
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const appointment = { id: APPT, name: "Pat Lee", email: "pat@example.com", lead_id: LEAD };
const business = { businessName: "Acme Wash", reviewLink: "https://search.google.com/local/writereview?placeid=ChIJabc", reviewSequenceEnabled: true };

describe("review sequence helpers", () => {
  it("has two email steps: 1 hour and day 3", () => {
    expect(REVIEW_SEQUENCE_STEPS.map((s) => s.delayMinutes)).toEqual([60, 4320]);
  });

  it("makes unguessable url-safe tokens", () => {
    const a = newFeedbackToken();
    expect(isFeedbackToken(a)).toBe(true);
    expect(a).toHaveLength(32);
    expect(newFeedbackToken()).not.toBe(a);
    expect(isFeedbackToken("short")).toBe(false);
    expect(isFeedbackToken(`${TOKEN}/../x`)).toBe(false);
  });

  it("routes 4–5 stars to Google and 1–3 to private feedback", () => {
    expect([1, 2, 3, 4, 5].map(routeForRating)).toEqual(["private", "private", "private", "google", "google"]);
  });

  it("accepts only whole ratings 1–5", () => {
    expect(parseRating("5")).toBe(5);
    expect(parseRating(1)).toBe(1);
    for (const bad of ["0", "6", "4.5", "", "x", null, undefined]) expect(parseRating(bad)).toBeNull();
  });

  it("cleans and caps private notes", () => {
    expect(cleanFeedback("  late\u0007 arrival \n")).toBe("late arrival");
    expect(cleanFeedback("   ")).toBeNull();
    expect(cleanFeedback("x".repeat(5000))).toHaveLength(2000);
  });

  it("only forwards to https review links", () => {
    expect(safeReviewUrl(business.reviewLink)).toBe(business.reviewLink);
    expect(safeReviewUrl("javascript:alert(1)")).toBeNull();
    expect(safeReviewUrl("http://g.page/acme")).toBeNull();
    expect(safeReviewUrl("https://user:pw@evil.test")).toBeNull();
    expect(safeReviewUrl("")).toBeNull();
  });

  it("finds the feedback link in a run body", () => {
    const [ask] = reviewSequenceMessages({ customerName: "Pat Lee", businessName: "Acme Wash", url: feedbackUrl(TOKEN) });
    expect(ask!.subject).toBe("How did we do, Pat?");
    expect(ask!.body).toContain("Acme Wash");
    expect(feedbackUrlFromBody(ask!.body)).toBe(`https://revoragrowthsystems.com/feedback/${TOKEN}`);
    expect(feedbackUrlFromBody("Thanks! https://g.page/acme")).toBeNull();
  });
});

describe("startReviewSequence", () => {
  it("queues the 1-hour ask and the day-3 reminder as email review_request runs", async () => {
    const { db, calls } = fakeDb({});
    const out = await startReviewSequence(db, { organizationId: ORG, appointment, business }, NOW);
    expect(out).toEqual({ started: true });
    const claim = calls.find((c) => c.table === "review_feedback_requests" && c.op === "insert")!;
    const row = claim.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ organization_id: ORG, appointment_id: APPT, lead_id: LEAD, customer_name: "Pat Lee" });
    expect(isFeedbackToken(row["token"])).toBe(true);
    const runs = calls.find((c) => c.table === "automation_runs" && c.op === "insert")!.args[0] as Record<string, unknown>[];
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run).toMatchObject({ trigger_event: "review_request", action_type: "email", recipient: "pat@example.com", status: "queued", appointment_id: APPT });
      expect(feedbackUrlFromBody(run["body"] as string)).toBe(feedbackUrl(row["token"] as string));
    }
    expect(runs.map((r) => r["scheduled_for"])).toEqual(["2026-11-02T16:00:00.000Z", "2026-11-05T15:00:00.000Z"]);
  });

  it.each([
    ["off", { ...business, reviewSequenceEnabled: false }, appointment],
    ["no_review_link", { ...business, reviewLink: null }, appointment],
    ["no_email", business, { ...appointment, email: " " }],
  ] as const)("does nothing when %s", async (reason, biz, appt) => {
    const { db, calls } = fakeDb({});
    expect(await startReviewSequence(db, { organizationId: ORG, appointment: appt, business: biz }, NOW)).toEqual({ started: false, reason });
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("defers to the workspace's own 'Appointment completed' automation", async () => {
    const { db, calls } = fakeDb({ "automations:select": { data: [{ id: "a1" }], error: null } });
    expect(await startReviewSequence(db, { organizationId: ORG, appointment, business }, NOW)).toEqual({ started: false, reason: "custom_automation" });
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("never asks the same job twice", async () => {
    const manual = fakeDb({ "automation_runs:select": { data: [{ id: "r1" }], error: null } });
    expect(await startReviewSequence(manual.db, { organizationId: ORG, appointment, business }, NOW)).toEqual({ started: false, reason: "already_asked" });
    const repeat = fakeDb({ "review_feedback_requests:insert": { data: null, error: { message: "duplicate key" } } });
    expect(await startReviewSequence(repeat.db, { organizationId: ORG, appointment, business }, NOW)).toEqual({ started: false, reason: "already_asked" });
    expect(repeat.calls.filter((c) => c.table === "automation_runs" && c.op === "insert")).toHaveLength(0);
  });

  it("skips only this job's queued review runs", async () => {
    const { db, calls } = fakeDb({});
    await skipQueuedReviewRuns(db, ORG, APPT);
    expect(calls.find((c) => c.op === "update")!.args[0]).toEqual({ status: "skipped" });
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([["organization_id", ORG], ["appointment_id", APPT], ["trigger_event", "review_request"], ["status", "queued"]]);
  });
});

describe("marking a job completed", () => {
  const USER = "33333333-3333-4333-8333-333333333333";
  const userDb = (enabled: boolean) =>
    fakeDb({
      "memberships:select": { data: { role: "staff" }, error: null },
      "organizations:select": { data: { id: ORG, name: "Acme Wash" }, error: null },
      "business_profiles:select": {
        data: { email: "owner@acme.test", owner_email: null, state: "TX", review_link: business.reviewLink, review_sequence_enabled: enabled },
        error: null,
      },
      "appointments:select": {
        data: { ...appointment, phone: null, starts_at: "2026-11-01T15:00:00Z", status: "completed" },
        error: null,
      },
    });
  const run = (enabled: boolean) => {
    const user = userDb(enabled);
    const admin = fakeDb({});
    return queueAutomationEventFor(
      user.db,
      USER,
      { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT },
      { admin: admin.db, deliverFor: () => async () => ({ ok: true as const }) },
    ).then((result) => ({ result, admin }));
  };

  it("starts the sequence when the owner switched it on", async () => {
    const { result, admin } = await run(true);
    expect(result.reviewSequence).toEqual({ started: true });
    expect(admin.calls.some((c) => c.table === "review_feedback_requests" && c.op === "insert")).toBe(true);
  });

  it("stays off by default", async () => {
    const { result, admin } = await run(false);
    expect(result.reviewSequence).toEqual({ started: false, reason: "off" });
    expect(admin.calls.some((c) => c.table === "review_feedback_requests")).toBe(false);
  });
});

describe("recording the customer's rating", () => {
  const requestRow = (over: Record<string, unknown> = {}) => ({
    id: "req-1",
    organization_id: ORG,
    appointment_id: APPT,
    customer_name: "Pat Lee",
    rating: null,
    routed_to: null,
    feedback: null,
    ...over,
  });
  const base = (row: Record<string, unknown>) => ({
    "review_feedback_requests:select": { data: row, error: null },
    "organizations:select": { data: { name: "Acme Wash" }, error: null },
    "business_profiles:select": { data: { review_link: business.reviewLink }, error: null },
    "review_feedback_requests:update": { data: [{ id: "req-1" }], error: null },
  });

  it("reads without writing", async () => {
    const { db, calls } = fakeDb(base(requestRow()));
    const view = await loadFeedbackView(db, TOKEN);
    expect(view).toMatchObject({ businessName: "Acme Wash", firstName: "Pat", rating: null, reviewUrl: business.reviewLink });
    expect(calls.filter((c) => ["insert", "update"].includes(c.op))).toHaveLength(0);
    expect(await loadFeedbackView(db, "not-a-token")).toBeNull();
  });

  it("5 stars → Google, stops the reminder, no owner alert", async () => {
    const { db, calls } = fakeDb(base(requestRow()));
    const view = await recordFeedbackRating(db, TOKEN, 5);
    expect(view).toMatchObject({ rating: 5, routedTo: "google", reviewUrl: business.reviewLink });
    expect(calls.some((c) => c.table === "automation_runs" && c.op === "update")).toBe(true);
    expect(calls.some((c) => c.table === "notifications")).toBe(false);
  });

  it("2 stars → private route, owner is told in-app, Google link still offered", async () => {
    const { db, calls } = fakeDb(base(requestRow()));
    const view = await recordFeedbackRating(db, TOKEN, 2);
    expect(view).toMatchObject({ rating: 2, routedTo: "private", reviewUrl: business.reviewLink });
    const note = calls.find((c) => c.table === "notifications" && c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(note).toMatchObject({ organization_id: ORG, link: "/app/reviews" });
    expect(calls.some((c) => c.table === "automation_runs" && c.op === "update")).toBe(true);
  });

  it("the first rating sticks", async () => {
    const { db, calls } = fakeDb(base(requestRow({ rating: 5, routed_to: "google" })));
    expect(await recordFeedbackRating(db, TOKEN, 1)).toMatchObject({ rating: 5, routedTo: "google" });
    expect(calls.filter((c) => c.op === "update" || c.op === "insert")).toHaveLength(0);
  });

  it("saves a private note once as an unpublished review", async () => {
    const { db, calls } = fakeDb({
      ...base(requestRow({ rating: 2, routed_to: "private" })),
      "reviews:insert": { data: { id: "rev-1" }, error: null },
    });
    const view = await recordPrivateFeedback(db, TOKEN, "  They were late. ");
    expect(view).toMatchObject({ feedbackSent: true });
    const review = calls.find((c) => c.table === "reviews" && c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(review).toEqual({
      organization_id: ORG,
      appointment_id: APPT,
      author_name: "Pat Lee",
      rating: 2,
      private_feedback: "They were late.",
      is_published: false,
    });
  });

  it("ignores notes for Google-routed or already-noted requests", async () => {
    for (const row of [requestRow({ rating: 5, routed_to: "google" }), requestRow({ rating: 2, routed_to: "private", feedback: "x" }), requestRow()]) {
      const { db, calls } = fakeDb(base(row));
      await recordPrivateFeedback(db, TOKEN, "hello");
      expect(calls.filter((c) => c.op === "insert" || c.op === "update")).toHaveLength(0);
    }
  });
});

describe("review request email", () => {
  it("is registered and links each star to the feedback page", async () => {
    expect(TEMPLATES["review-request"]).toBe(reviewRequestTemplate);
    const url = feedbackUrl(TOKEN);
    const html = await render(
      React.createElement(reviewRequestTemplate.component as React.ComponentType<Record<string, unknown>>, {
        businessName: "Acme Wash",
        heading: "How did we do, Pat?",
        message: `Hi Pat, thanks for choosing Acme Wash.\n\n${url}`,
        feedbackUrl: url,
      }),
    );
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`${url}?rating=${n}`);
    expect(html.replace(/<!-- -->/g, "")).toContain("Hi Pat, thanks for choosing Acme Wash.");
  });

  it("is used only for review_request runs that carry a feedback link", () => {
    const src = readFileSync("src/lib/messaging.server.ts", "utf8");
    expect(src).toMatch(/run\.trigger_event === "review_request" \? feedbackUrlFromBody\(run\.body\) : null/);
    expect(src).toMatch(/feedbackUrl \? "review-request" : "automation-message"/);
  });
});

describe("feedback page safety", () => {
  const route = readFileSync("src/routes/feedback.$token.tsx", "utf8");
  const fn = readFileSync("src/lib/review-feedback.functions.ts", "utf8");

  it("GET (loader and public function) never records anything", () => {
    expect(fn).not.toMatch(/recordFeedbackRating|recordPrivateFeedback|\.insert\(|\.update\(/);
    expect(fn).toMatch(/createServerFn\(\{ method: "GET" \}\)/);
    const loader = route.slice(route.indexOf("loader:"), route.indexOf("head:"));
    expect(loader).not.toMatch(/record/);
    // Writes happen only in the POST handler.
    expect(route).toMatch(/POST: async \(\{ request, params \}\) => submit\(request, params\.token\)/);
    expect(route).not.toMatch(/GET:/);
  });

  it("is not indexed and keeps the public review link for low ratings (no review gating)", () => {
    expect(route).toMatch(/name: "robots", content: "noindex, nofollow"/);
    expect(route).toMatch(/<PublicReviewLink url=\{view\.reviewUrl\}/);
  });
});

describe("review sequence migration", () => {
  const FILE = "supabase/migrations/20261103120000_review_feedback_sequence.sql";
  const code = readFileSync(FILE, "utf8").replace(/--.*$/gm, "");

  it("is newer than the base branch and destroys nothing", () => {
    expect("20261103120000" > "20261101170000").toBe(true);
    expect(code).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|ALTER\s+COLUMN/i);
  });

  it("is org-scoped, read-only for members, and never exposes the token to them", () => {
    expect(code).toMatch(/alter table public\.review_feedback_requests enable row level security/);
    expect(code).toMatch(/for select to authenticated using \(private\.is_org_member\(organization_id\)\)/);
    expect(code).not.toMatch(/using \(true\)/i);
    const memberGrant = code.match(/grant select \(([^)]*)\) on public\.review_feedback_requests to authenticated/)!;
    expect(memberGrant).toBeTruthy();
    expect(memberGrant[1]).not.toMatch(/\btoken\b/);
    expect(code).toMatch(/grant all on public\.review_feedback_requests to service_role/);
    expect(code).toMatch(/unique \(organization_id, appointment_id\)/);
  });

  it("adds the owner's switch, off by default", () => {
    expect(code).toMatch(/add column if not exists review_sequence_enabled boolean not null default false/);
  });
});
