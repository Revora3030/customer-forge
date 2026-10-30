import { describe, expect, it } from "vitest";
import { shouldTrackFormEvent } from "./site-event-once";

describe("form interaction events", () => {
  it("counts repeated quote selection and back/continue only once per event", () => {
    const seen = new Set<string>();
    expect(shouldTrackFormEvent(seen, "quote_start", false)).toBe(true);
    expect(shouldTrackFormEvent(seen, "quote_start", false)).toBe(false);
    expect(shouldTrackFormEvent(seen, "quote_complete", false)).toBe(true);
    expect(shouldTrackFormEvent(seen, "quote_complete", false)).toBe(false);
  });
  it("does not record draft preview interactions", () => {
    const seen = new Set<string>();
    expect(shouldTrackFormEvent(seen, "booking_start", true)).toBe(false);
    expect(seen.size).toBe(0);
    expect(shouldTrackFormEvent(seen, "booking_start", false)).toBe(true);
  });
  it("counts field focus once without merging distinct form lifecycles", () => {
    expect(shouldTrackFormEvent(new Set(), "enquiry_start", false)).toBe(true);
    const seen = new Set<string>();
    expect(shouldTrackFormEvent(seen, "enquiry_start", false)).toBe(true);
    expect(shouldTrackFormEvent(seen, "enquiry_start", false)).toBe(false);
  });
});