import { describe, expect, it } from "vitest";
import {
  canSendEmail,
  canSendSms,
  capAllows,
  gbpScore,
  MANUAL_ONLY,
  napMismatches,
  napReady,
  postRelevance,
  RELEVANCE_THRESHOLD,
  statusAfterEdit,
} from "./rules";

describe("growth engine rules", () => {
  it("blocks texts without a recorded opt-in", () => {
    expect(canSendSms({ phone: "+19195550100", smsConsentAt: null, smsProviderConnected: true }).ok).toBe(false);
  });
  it("blocks texts while no texting service is connected", () => {
    expect(
      canSendSms({ phone: "+19195550100", smsConsentAt: "2026-10-01T00:00:00Z", smsProviderConnected: false }).ok,
    ).toBe(false);
  });
  it("allows a text only with opt-in, phone and provider", () => {
    expect(
      canSendSms({ phone: "+19195550100", smsConsentAt: "2026-10-01T00:00:00Z", smsProviderConnected: true }).ok,
    ).toBe(true);
  });
  it("requires a mailing address on automated email", () => {
    expect(canSendEmail({ email: "a@b.com", mailingAddress: "" }).ok).toBe(false);
    expect(canSendEmail({ email: "a@b.com", mailingAddress: "1 Main St" }).ok).toBe(true);
  });
  it("caps Reddit replies at 3 per day", () => {
    expect(capAllows("reddit", 2)).toBe(true);
    expect(capAllows("reddit", 3)).toBe(false);
  });
  it("never lets Jarvis send partnership pitches itself", () => {
    expect(MANUAL_ONLY.has("partnership_pitch")).toBe(true);
  });
  it("sends any edited item back for approval", () => {
    expect(statusAfterEdit("executed")).toBe("pending");
  });
  it("flags name/address/phone mismatches", () => {
    const src = { name: "Shined Up LLC", address: "12 Oak Street", phone: "(919) 555-0100" };
    expect(napMismatches(src, { name: "Shined Up", address: "12 Oak St", phone: "+1 919 555 0100" })).toEqual([]);
    expect(napMismatches(src, { name: "Shined Up", address: "14 Oak St", phone: "919-555-0199" })).toEqual([
      "address",
      "phone",
    ]);
  });
  it("blocks submission when the record lacks an address", () => {
    expect(napReady({ name: "X", address: "", phone: "1" })).toEqual(["address"]);
  });
  it("scores a complete profile 100", () => {
    const now = new Date("2026-10-21T00:00:00Z");
    const r = gbpScore(
      {
        category: "Car detailing",
        hasHours: true,
        photosCount: 12,
        lastPhotoDate: "2026-10-10",
        postsCount: 5,
        lastPostDate: "2026-10-18",
        reviewsCount: 20,
        avgRating: 4.8,
        hasBookingLink: true,
        hasDescription: true,
      },
      now,
    );
    expect(r.score).toBe(100);
    expect(r.fixes).toEqual([]);
  });
  it("only surfaces posts with niche, city and intent", () => {
    expect(postRelevance("Can anyone recommend a mobile detailing guy in Durham?", "mobile detailing", "Durham")).toBeGreaterThanOrEqual(
      RELEVANCE_THRESHOLD,
    );
    expect(postRelevance("Detailing is fun", "mobile detailing", "Durham")).toBeLessThan(RELEVANCE_THRESHOLD);
  });
});
