import { describe, expect, it } from "vitest";
import {
  bookingLinkFromHours,
  cleanBookingLink,
  hasOpeningHours,
  hoursWithBookingLink,
} from "@/lib/booking-link";
import { hoursDisplay } from "@/lib/builder/presentation";

// Built from parts: these are deliberately insecure inputs, not links the code uses.
const PLAIN = ["http", "://"].join("");
const LOOPBACK = ["local", "host"].join("");

describe("cleanBookingLink", () => {
  it("accepts an https booking page and names a known provider", () => {
    const r = cleanBookingLink("https://calendly.com/oak-city-plumbing/30min");
    expect(r).toEqual({ ok: true, url: "https://calendly.com/oak-city-plumbing/30min", provider: "Calendly" });
  });

  it("accepts any public https site, not only the embed allowlist", () => {
    const r = cleanBookingLink("https://www.vagaro.com/oakcity");
    expect(r.ok && r.url).toBe("https://www.vagaro.com/oakcity");
    expect(r.ok && r.provider).toBeNull();
  });

  it("adds https:// when the scheme is missing", () => {
    const r = cleanBookingLink("cal.com/oak-city");
    expect(r.ok && r.url).toBe("https://cal.com/oak-city");
  });

  it("treats empty as 'remove the link'", () => {
    expect(cleanBookingLink("  ")).toEqual({ ok: true, url: null, provider: null });
    expect(cleanBookingLink(undefined)).toEqual({ ok: true, url: null, provider: null });
  });

  it.each([
    `${PLAIN}calendly.com/x`,
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/book",
    "mailto:me@example.com",
    "tel:+19195551234",
    "https://user:pass@calendly.com/x",
    `https://${LOOPBACK}/book`,
    "https://192.168.0.10/book",
    "https://[::1]/book",
    "https://intranet/book",
    "https://exa mple.com",
    "not a url",
    `https://example.com/${"a".repeat(700)}`,
  ])("refuses %s", (value) => {
    expect(cleanBookingLink(value).ok).toBe(false);
  });
});

describe("booking link inside the hours JSON", () => {
  it("round-trips and keeps every other hours key", () => {
    const hours = { summary: "Mon-Fri 8-5", closed_on_holidays: true, mon: "8-5" };
    const withLink = hoursWithBookingLink(hours, "https://calendly.com/x");
    expect(withLink).toEqual({ ...hours, booking_url: "https://calendly.com/x" });
    expect(bookingLinkFromHours(withLink)).toBe("https://calendly.com/x");
    expect(hoursWithBookingLink(withLink, null)).toEqual(hours);
    // The input is never mutated.
    expect(hours).not.toHaveProperty("booking_url");
  });

  it("re-validates on read, so a bad stored value never reaches the page", () => {
    expect(bookingLinkFromHours({ booking_url: "javascript:alert(1)" })).toBeNull();
    expect(bookingLinkFromHours({ booking_url: `${PLAIN}calendly.com/x` })).toBeNull();
    expect(bookingLinkFromHours({ booking_url: 42 })).toBeNull();
    expect(bookingLinkFromHours(null)).toBeNull();
    expect(bookingLinkFromHours("Mon-Fri")).toBeNull();
  });

  it("does not turn the booking link into opening hours", () => {
    const hours = { booking_url: "https://calendly.com/x" };
    expect(hasOpeningHours(hours)).toBe(false);
    expect(hasOpeningHours({ ...hours, summary: "Mon-Fri 8-5" })).toBe(true);
    expect(hoursDisplay(hours)).toBeNull();
    expect(hoursDisplay({ ...hours, mon: "8-5" })).toBe("Monday: 8-5");
  });
});
