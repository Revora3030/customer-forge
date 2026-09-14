import { describe, expect, it } from "vitest";
import { conversionBlueprint } from "./conversion-blueprint";

describe("conversion blueprint", () => {
  it("prefers real booking capability for booking requests", () => {
    const result = conversionBlueprint({ instruction: "get me more bookings", hasPhone: true, hasEmail: true, hasBooking: true, hasServices: true, hasReviews: true });
    expect(result.primaryOutcome).toBe("bookings");
    expect(result.ctaLabels).toContain("Book Now");
  });

  it("never promises a phone CTA when no phone exists", () => {
    const result = conversionBlueprint({ instruction: "get more calls", hasPhone: false, hasEmail: true, hasBooking: false, hasServices: true, hasReviews: false });
    expect(result.primaryOutcome).not.toBe("calls");
    expect(result.ctaLabels).not.toContain("Call Now");
  });
});
