import { describe, expect, it } from "vitest";
import { buildGrowthAuditInput } from "./growth-audit-input";
import { growthAudit } from "./growth-command";

const base = {
  businessName: "Acme",
  profile: { phone: "555", hours: { mon: "9-5" }, city: "  " },
  seo: { headline: "Hi" },
  copy: null,
  facts: null,
  servicesLength: 2,
  pages: [{ sections: [{ is_visible: true }, { is_visible: false }] }],
  publishState: undefined,
  domainStatus: undefined,
};

describe("buildGrowthAuditInput", () => {
  it("reads only saved values and defaults the rest to empty", () => {
    const input = buildGrowthAuditInput(base);
    expect(input.phone).toBe("555");
    expect(input.city).toBeNull();
    expect(input.hoursSet).toBe(true);
    expect(input.servicesCount).toBe(2);
    expect(input.visibleSections).toBe(1);
    expect(input.publishState).toBe("draft");
    expect(input.leads).toBe(0);
  });
  it("prefers server facts when present", () => {
    const input = buildGrowthAuditInput({
      ...base,
      facts: {
        servicesCount: 5,
        pricedServicesCount: 1,
        bookableCount: 0,
        quoteFormCount: 0,
        mediaCount: 3,
        reviewCount: 0,
        socialLinks: 0,
        signals: { visitors: 10, leads: 2, bookings: 0, callClicks: 1 },
      },
    });
    expect(input.servicesCount).toBe(5);
    expect(input.leads).toBe(2);
    expect(growthAudit(input).score).toBeGreaterThanOrEqual(0);
  });
});
