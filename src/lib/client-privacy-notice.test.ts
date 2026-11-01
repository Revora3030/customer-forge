import { describe, expect, it } from "vitest";
import {
  clientPrivacyNotice,
  placeholder,
  type ClientNoticeInput,
} from "@/lib/client-privacy-notice";

const base: ClientNoticeInput = {
  businessName: "Oak Plumbing",
  email: "owner@oak.example",
  phone: "919-555-0100",
  address: "1 Main St, Raleigh, NC",
  hasQuoteForm: false,
  hasBooking: false,
  hasMap: false,
  loadsWebFonts: false,
};
const text = (input: ClientNoticeInput) =>
  clientPrivacyNotice(input)
    .sections.flatMap((s) => [s.heading, ...s.paragraphs])
    .join("\n");

describe("clientPrivacyNotice", () => {
  it("uses only the facts the owner provided", () => {
    const body = text(base);
    expect(body).toContain("Oak Plumbing, 1 Main St, Raleigh, NC");
    expect(body).toContain("email owner@oak.example and call 919-555-0100");
    expect(body).not.toMatch(/LLC|Inc\.|Ltd/);
  });

  it("shows placeholders for anything missing instead of guessing", () => {
    const notice = clientPrivacyNotice({
      ...base,
      businessName: " ",
      email: null,
      phone: null,
      address: null,
    });
    const body = text({ ...base, businessName: " ", email: null, phone: null, address: null });
    expect(body).toContain(placeholder("Business name"));
    expect(body).toContain(placeholder("Business postal address"));
    expect(body).toContain(placeholder("Privacy contact (email or phone)"));
    expect(notice.missing).toEqual(
      expect.arrayContaining([
        "Business name",
        "Business postal address",
        "Privacy contact (email or phone)",
      ]),
    );
  });

  it("always leaves retention and sharing as placeholders", () => {
    const body = text(base);
    expect(body).toContain(placeholder("How long enquiries and bookings are kept"));
    expect(body).toContain(placeholder("Other companies the business shares your details with"));
  });

  it("mentions Google Fonts, Maps and booking only when the site uses them", () => {
    const plain = text(base);
    expect(plain).not.toContain("Google Fonts");
    expect(plain).not.toContain("Google Map");
    expect(plain).not.toContain("arrange the booking");
    const full = text({
      ...base,
      hasMap: true,
      loadsWebFonts: true,
      hasBooking: true,
      hasQuoteForm: true,
    });
    expect(full).toContain("Google Fonts");
    expect(full).toContain("Google Map");
    expect(full).toContain("arrange the booking you asked for");
    expect(full).toContain("prepare the quote you asked for");
  });

  it("states there are no ad cookies or third-party analytics", () => {
    expect(text(base)).toContain("does not set advertising cookies");
  });
});
