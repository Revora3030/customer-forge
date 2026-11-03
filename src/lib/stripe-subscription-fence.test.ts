import { describe, expect, it } from "vitest";
import {
  decideSubscriptionProjection,
  storedEventCreated,
  stripeEventCreated,
} from "@/lib/stripe-subscription-fence";

const stored = (status: string, lastEventCreated: number | null, id = "sub_A") => ({
  providerSubscriptionId: id,
  status,
  lastEventCreated,
});
const incoming = (status: string, eventCreated: number | null, id = "sub_A") => ({
  subscriptionId: id,
  status,
  eventCreated,
});

describe("decideSubscriptionProjection", () => {
  it("applies the first event for a workspace and starts the fence", () => {
    expect(decideSubscriptionProjection(null, incoming("trialing", 100))).toEqual({
      apply: true,
      reason: "first",
      nextEventCreated: 100,
    });
  });

  it("applies newer events and advances the fence", () => {
    expect(decideSubscriptionProjection(stored("trialing", 100), incoming("active", 150))).toEqual({
      apply: true,
      reason: "applied",
      nextEventCreated: 150,
    });
  });

  it("layer 2: drops an out-of-order (strictly older) event", () => {
    expect(decideSubscriptionProjection(stored("past_due", 200), incoming("active", 150))).toEqual({
      apply: false,
      reason: "stale_fenced",
    });
  });

  it("layer 1: canceled is terminal for the subscription id even with a newer event", () => {
    expect(decideSubscriptionProjection(stored("canceled", 200), incoming("active", 300))).toEqual({
      apply: false,
      reason: "terminal_blocked",
    });
  });

  it("same-second tie never moves canceled back to live", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(decideSubscriptionProjection(stored("canceled", 200), incoming(status, 200))).toEqual({
        apply: false,
        reason: "tie_blocked_resurrection",
      });
    }
  });

  it("same-second tie may still move live to canceled", () => {
    expect(decideSubscriptionProjection(stored("active", 200), incoming("canceled", 200))).toMatchObject({
      apply: true,
      nextEventCreated: 200,
    });
  });

  it("a duplicate delivery of the applied event is a harmless re-apply that keeps the fence", () => {
    expect(decideSubscriptionProjection(stored("active", 200), incoming("active", 200))).toEqual({
      apply: true,
      reason: "applied",
      nextEventCreated: 200,
    });
    expect(decideSubscriptionProjection(stored("canceled", 200), incoming("canceled", 200))).toMatchObject({ apply: true });
  });

  it("an older event never lowers the fence; a missing created keeps the stored fence", () => {
    expect(decideSubscriptionProjection(stored("active", 200), incoming("active", null))).toEqual({
      apply: true,
      reason: "applied",
      nextEventCreated: 200,
    });
  });

  it("a missing created on a canceled subscription still cannot resurrect it", () => {
    expect(decideSubscriptionProjection(stored("canceled", null), incoming("active", null))).toMatchObject({
      apply: false,
      reason: "terminal_blocked",
    });
  });

  it("another subscription ending never replaces the workspace's live subscription", () => {
    expect(decideSubscriptionProjection(stored("active", 100, "sub_NEW"), incoming("canceled", 300, "sub_OLD"))).toEqual({
      apply: false,
      reason: "other_subscription_ended",
    });
  });

  it("a resubscribe (new id) after a cancel is applied", () => {
    expect(decideSubscriptionProjection(stored("canceled", 100, "sub_OLD"), incoming("active", 300, "sub_NEW"))).toMatchObject({
      apply: true,
      nextEventCreated: 300,
    });
  });

  it("a stale event for another subscription is dropped", () => {
    expect(decideSubscriptionProjection(stored("canceled", 300, "sub_OLD"), incoming("active", 100, "sub_NEW"))).toEqual({
      apply: false,
      reason: "stale_fenced",
    });
  });
});

describe("event created parsing", () => {
  it("reads Stripe event.created defensively", () => {
    expect(stripeEventCreated({ created: 1_700_000_000 })).toBe(1_700_000_000);
    expect(stripeEventCreated({ created: "1700000000" })).toBeNull();
    expect(stripeEventCreated({ created: -1 })).toBeNull();
    expect(stripeEventCreated({})).toBeNull();
    expect(stripeEventCreated(null)).toBeNull();
  });

  it("reads the stored bigint as number or numeric string", () => {
    expect(storedEventCreated(1_700_000_000)).toBe(1_700_000_000);
    expect(storedEventCreated("1700000000")).toBe(1_700_000_000);
    expect(storedEventCreated("abc")).toBeNull();
    expect(storedEventCreated(null)).toBeNull();
  });
});
