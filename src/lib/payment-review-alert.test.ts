import { describe, expect, it, vi } from "vitest";

const sendFounderAlert = vi.fn(async () => "sent");
vi.mock("@/lib/founder-alerts.server", () => ({ sendFounderAlert }));

describe("payment review alert", () => {
  it("never emails for test-mode events", async () => {
    const { alertPaymentNeedsReview } = await import("./payment-review-alert.server");
    const out = await alertPaymentNeedsReview({} as never, {
      eventId: "evt_1", stage: "verification", eventType: "checkout.session.completed",
      environment: "sandbox", organizationId: null, reason: "x",
    });
    expect(out).toBe("test_mode");
    expect(sendFounderAlert).not.toHaveBeenCalled();
  });

  it("uses one marker per event for every stage", async () => {
    const { alertPaymentNeedsReview } = await import("./payment-review-alert.server");
    for (const stage of ["processing", "stuck"] as const) {
      await alertPaymentNeedsReview({} as never, {
        eventId: "evt_2", stage, eventType: "invoice.paid", environment: "live", organizationId: "org", reason: "boom",
      });
    }
    const markers = (sendFounderAlert.mock.calls as unknown as [unknown, { marker: string; kind: string }][]).map((c) => c[1]);
    expect(markers.map((m) => m.marker)).toEqual(["payment-review:evt_2", "payment-review:evt_2"]);
    expect(markers[0]!.kind).toBe("payment_needs_review");
  });

  it("redacts keys and emails from the reason", async () => {
    const { safeReason } = await import("./payment-review-alert.server");
    expect(safeReason(`bad key ${["sk", "live", "123abc"].join("_")} for a@b.co`)).toBe("bad key [redacted] for [email]");
    expect(safeReason("x".repeat(500))).toHaveLength(200);
  });
});
