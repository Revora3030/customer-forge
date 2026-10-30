import { describe, expect, it } from "vitest";
import { HOSTING_GRACE_DAYS, offlineAfter, planHosting, type HostingGrace, type HostingSub } from "./site-hosting";
import { PLATFORM_OWNER_ORG_ID } from "./platform-owner";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const sub = (org: string, status: string, end: string | null, id = `sub_${org}`): HostingSub => ({
  organization_id: org,
  status,
  current_period_end: end,
  provider_subscription_id: id,
});
const grace = (org: string, over: Partial<HostingGrace> = {}): HostingGrace => ({
  organization_id: org,
  ended_at: daysAgo(5),
  offline_after: inDays(9),
  warning_sent_at: null,
  offline_at: null,
  ...over,
});

describe("canceled-site grace period", () => {
  it("starts a 14-day grace period when a canceled subscription's paid period is over", () => {
    const plan = planHosting({
      subs: [sub("a", "canceled", daysAgo(1)), sub("b", "canceled", inDays(10)), sub("c", "active", inDays(20))],
      graces: [],
      orgs: [{ id: "a" }, { id: "b" }, { id: "c" }],
      now: NOW,
    });
    expect(plan.create).toEqual([
      { organization_id: "a", stripe_subscription_id: "sub_a", ended_at: daysAgo(1), offline_after: inDays(HOSTING_GRACE_DAYS - 1) },
    ]);
    expect(plan.warn).toEqual([]);
    expect(plan.takeOffline).toEqual([]);
  });

  it("never tracks demo or Revora-owned workspaces, or a workspace with another live subscription", () => {
    const plan = planHosting({
      subs: [
        sub("demo", "canceled", daysAgo(30)),
        sub(PLATFORM_OWNER_ORG_ID, "canceled", daysAgo(30)),
        sub("resub", "canceled", daysAgo(30), "old"),
        sub("resub", "active", inDays(30), "new"),
      ],
      graces: [],
      orgs: [{ id: "demo", is_demo: true }, { id: PLATFORM_OWNER_ORG_ID }, { id: "resub" }],
      now: NOW,
    });
    expect(plan.create).toEqual([]);
  });

  it("gives a subscription that ended long ago at least the 3-day warning, never an instant takedown", () => {
    expect(offlineAfter(daysAgo(60), NOW)).toBe(inDays(3));
    const plan = planHosting({ subs: [sub("old", "canceled", daysAgo(60))], graces: [], orgs: [{ id: "old" }], now: NOW });
    expect(plan.create[0]?.offline_after).toBe(inDays(3));
    expect(plan.warn).toEqual([{ organization_id: "old", offline_after: inDays(3) }]);
    expect(plan.takeOffline).toEqual([]);
  });

  it("warns 3 days before and takes the site offline only after the warning and the grace period", () => {
    const plan = planHosting({
      subs: ["w", "early", "due", "unwarned", "done"].map((o) => sub(o, "canceled", daysAgo(20))),
      graces: [
        grace("w", { offline_after: inDays(2) }),
        grace("early", { offline_after: inDays(5) }),
        grace("due", { offline_after: daysAgo(1), warning_sent_at: daysAgo(4) }),
        grace("unwarned", { offline_after: daysAgo(1) }),
        grace("done", { offline_after: daysAgo(5), warning_sent_at: daysAgo(8), offline_at: daysAgo(5) }),
      ],
      orgs: ["w", "early", "due", "unwarned", "done"].map((id) => ({ id })),
      now: NOW,
    });
    expect(plan.warn).toEqual([
      { organization_id: "w", offline_after: inDays(3) },
      { organization_id: "unwarned", offline_after: inDays(3) },
    ]);
    expect(plan.takeOffline).toEqual(["due"]);
    expect(plan.create).toEqual([]);
  });

  it("brings a site back when the workspace subscribes again", () => {
    const plan = planHosting({
      subs: [sub("back", "canceled", daysAgo(40), "old"), sub("back", "trialing", inDays(30), "new"), sub("gone", "canceled", daysAgo(40))],
      graces: [grace("back", { offline_at: daysAgo(10), warning_sent_at: daysAgo(13) }), grace("gone", { offline_at: daysAgo(10), warning_sent_at: daysAgo(13) })],
      orgs: [{ id: "back" }, { id: "gone" }],
      now: NOW,
    });
    expect(plan.restore).toEqual(["back"]);
    expect(plan.takeOffline).toEqual([]);
  });
});
