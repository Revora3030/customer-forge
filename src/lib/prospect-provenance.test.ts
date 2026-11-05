import { describe, expect, it } from "vitest";
import { buildProvenance, normalizePhone, sourceLabel } from "./prospect-provenance";

const now = Date.parse("2026-11-05T12:00:00Z");
const marker = (extra: Record<string, unknown> = {}) => ({ kind: "prospect_demo", createdAt: "2026-11-01T12:00:00Z", ...extra });

describe("prospect provenance", () => {
  it("labels sources and falls back to unknown", () => {
    expect(sourceLabel(marker({ placeId: "osm:node/1", source: "autopilot" }))).toBe("OpenStreetMap (autopilot search)");
    expect(sourceLabel(marker({ placeId: "ChIJ123" }))).toBe("Google Maps");
    expect(sourceLabel(marker())).toBe("unknown");
    expect(sourceLabel(null)).toBe("unknown");
  });

  it("normalizes phones", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("12")).toBeNull();
  });

  it("computes freshness, why-ranked and duplicates without inventing values", () => {
    const a = { organizationId: "a", name: "Joe's Plumbing LLC", city: "Austin", phone: "555-123-4567", marker: marker({ siteGaps: ["no mobile layout"], enrichment: { status: "verified", source: "public_page", sourceUrl: "https://www.joes.com/contact", email: "joe@joes.com", checkedAt: "2026-11-04T12:00:00Z" } }) };
    const b = { organizationId: "b", name: "Joes Plumbing", city: "austin", phone: null, marker: marker() };
    const c = { organizationId: "c", name: "Other", city: null, phone: null, marker: null };
    const out = buildProvenance([a, c], [a, b, c], now);
    expect(out["a"]).toMatchObject({ freshness: "contact checked 1 day ago", duplicateOf: ["Joes Plumbing"], duplicateReason: "same name+city", whyRanked: "site gaps: no mobile layout; published email verified" });
    expect(out["c"]).toMatchObject({ source: "unknown", freshness: "unknown", duplicateOf: [], duplicateReason: null, whyRanked: "unknown" });
  });
});
