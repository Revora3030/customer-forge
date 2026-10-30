import { describe, expect, it } from "vitest";
import { HEALTH_WEIGHTS, bandFor, scoreCustomerHealth, type HealthInput } from "./health-score";
import { clientHealthEvents } from "./health-events";
import { DEFAULT_EVENT_RULES, planEventResponses } from "@/lib/cognition/event-rules";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const healthy = (): HealthInput => ({
  now: NOW,
  createdAt: ago(90),
  onboardingCompleted: true,
  site: { published: true, liveSince: ago(80), customDomain: "acme.com", domainVerified: true, dnsOk: true, sslOk: true, revoraHostOk: true },
  leadDates: [ago(1), ago(5), ago(20), ago(30)],
  newLeadDates: [],
  staffActivityDates: [ago(2)],
  profile: { phone: "919-555-0100", city: "Raleigh", serviceArea: null, address: null },
  billing: { status: "active", cancelAtPeriodEnd: false },
});

describe("customer health score", () => {
  it("weights add to 100", () => {
    expect(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("scores a working customer 100 and never guesses support", () => {
    const result = scoreCustomerHealth(healthy());
    expect(result.score).toBe(100);
    expect(result.band).toBe("healthy");
    expect(result.unknown).toEqual(["support"]);
    expect(result.reasons).toEqual([]);
  });

  it("drops a live site with no leads, no lead work and a past-due bill into critical", () => {
    const input = healthy();
    input.leadDates = [ago(40)];
    input.staffActivityDates = [];
    input.billing = { status: "past_due", cancelAtPeriodEnd: false };
    input.site = { ...input.site!, dnsOk: false };
    const result = scoreCustomerHealth(input);
    // website 5 + leads 0 + search 15 + onboarding 10 + billing 0, engagement unknown: 30 of 80.
    expect(result.score).toBe(38);
    expect(result.band).toBe("at_risk");
    expect(result.reasons[0]).toBe("No leads in the last 14 days.");
    input.onboardingCompleted = false;
    expect(scoreCustomerHealth(input).band).toBe("critical");
  });

  it("does not judge leads before the site has been live 14 days", () => {
    const input = healthy();
    input.site = { ...input.site!, liveSince: ago(5) };
    input.leadDates = [];
    const result = scoreCustomerHealth(input);
    expect(result.unknown).toContain("leads");
    expect(result.parts.find((p) => p.part === "leads")).toBeUndefined();
  });

  it("flags a lead pace under half the workspace's own baseline", () => {
    const input = healthy();
    input.leadDates = [ago(3), ...Array.from({ length: 16 }, (_, i) => ago(15 + i * 3))];
    const leads = scoreCustomerHealth(input).parts.find((p) => p.part === "leads")!;
    expect(leads.points).toBe(12);
  });

  it("counts leads waiting 72h+ but not ones under 72h or older than 14 days", () => {
    const input = healthy();
    input.newLeadDates = [ago(1), ago(4), ago(20)];
    expect(scoreCustomerHealth(input).unansweredLeads).toBe(1);
  });

  it("treats an unpublished site as not live and leaves search unscored", () => {
    const input = healthy();
    input.site = { ...input.site!, published: false };
    const result = scoreCustomerHealth(input);
    expect(result.parts.find((p) => p.part === "website")!.points).toBe(0);
    expect(result.unknown).toEqual(expect.arrayContaining(["leads", "search"]));
  });

  it("returns no score when nothing can be read", () => {
    const result = scoreCustomerHealth({ now: NOW, createdAt: null, onboardingCompleted: null, site: null, leadDates: [], newLeadDates: [], staffActivityDates: [], profile: null, billing: null });
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("bands at the retention lines", () => {
    expect(bandFor(60)).toBe("healthy");
    expect(bandFor(59)).toBe("at_risk");
    expect(bandFor(34)).toBe("critical");
  });
});

describe("retention autopilot events", () => {
  it("opens retention, no-lead and unanswered-lead notices for customers only", () => {
    const input = healthy();
    input.leadDates = [ago(40)];
    input.newLeadDates = [ago(5)];
    input.staffActivityDates = [];
    input.billing = { status: "past_due", cancelAtPeriodEnd: false };
    input.onboardingCompleted = false;
    input.site = { ...input.site!, sslOk: false };
    const health = scoreCustomerHealth(input);
    const events = clientHealthEvents(
      [
        { organizationId: "org-1", name: "Acme Plumbing", isCustomer: true, health },
        { organizationId: "org-2", name: "Prospect Co", isCustomer: false, health },
      ],
      NOW,
    );
    expect(events.map((e) => e.type).sort()).toEqual(["client.health_critical", "client.leads_unanswered", "client.no_leads"]);
    expect(events.every((e) => e.subject === "Acme Plumbing")).toBe(true);
    const { proposals } = planEventResponses({ events, rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: NOW });
    expect(proposals.map((p) => p.ruleId).sort()).toEqual(["client-leads-unanswered", "client-no-leads", "retention-escalate"]);
    for (const p of proposals) expect(p.prompt).toMatch(/approve|Do not|Never/);
  });

  it("stays quiet for a healthy customer", () => {
    expect(clientHealthEvents([{ organizationId: "o", name: "Fine Co", isCustomer: true, health: scoreCustomerHealth(healthy()) }], NOW)).toEqual([]);
  });
});
