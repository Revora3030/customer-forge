import { describe, expect, it } from "vitest";
import { launchReadiness, readiness } from "./readiness";

const profile = { tagline: "t", description: "d", city: "c", phone: "1", email: "e@x.co", address: "a" };
const settings = { publish_state: "draft" as const };

describe("launchReadiness (shared by /app and /app/launch)", () => {
  const services = [
    { is_active: true, bookable: true },
    { is_active: true, bookable: false },
    { is_active: false, bookable: true },
  ];
  const a = launchReadiness({ profile, settings, services, quoteForm: null, analytics: [] });

  it("is exactly what readiness() computes from the same rows", () => {
    const b = readiness({
      profile,
      settings,
      servicesCount: 2,
      bookableCount: 1,
      mediaCount: 0,
      quoteFormCount: 0,
      analyticsCount: 0,
    });
    expect(a).toEqual(b);
  });
  it("counts only active services and bookable active services", () => {
    expect(a.items.find((i) => i.key === "services")?.done).toBe(true);
    expect(a.items.find((i) => i.key === "booking")?.done).toBe(true);
  });
  it("reports the same percentage and missing list wherever it is shown", () => {
    const again = launchReadiness({ profile, settings, services, quoteForm: null, analytics: [] });
    expect(again.score).toBe(a.score);
    expect(again.missing.map((m) => m.key)).toEqual(a.missing.map((m) => m.key));
  });
  it("handles rows that have not loaded", () => {
    const empty = launchReadiness({ profile: null, settings: null, services: undefined, quoteForm: undefined, analytics: undefined });
    expect(empty.done).toBeLessThan(empty.total);
  });
});
