import { describe, expect, it } from "vitest";
import { clientPrivacyNotice, placeholder, type ClientNoticeInput } from "./client-privacy-notice";
import { readPrivacyNoticeDetails, withPrivacyNoticeDetails } from "./privacy-notice-details";

const input: ClientNoticeInput = {
  businessName: "Oak Plumbing",
  email: "owner@oak.test",
  phone: null,
  address: "1 Main St, Raleigh, NC",
  hasQuoteForm: true,
  hasBooking: false,
  hasMap: false,
  loadsWebFonts: false,
};
const text = (notice: ReturnType<typeof clientPrivacyNotice>) =>
  notice.sections.flatMap((section) => section.paragraphs).join("\n");

describe("privacy notice details", () => {
  it("reads and writes the owner's details inside generation, keeping other keys", () => {
    const next = withPrivacyNoticeDetails(
      { copy: { hero: "Hi" } },
      { retention: "  12 months\n", sharing: "" },
    );
    expect(next["copy"]).toEqual({ hero: "Hi" });
    expect(readPrivacyNoticeDetails(next)).toEqual({ retention: "12 months", sharing: null });
    expect(readPrivacyNoticeDetails(null)).toEqual({ retention: null, sharing: null });
    expect(readPrivacyNoticeDetails({ privacyNotice: { retention: 5 } })).toEqual({
      retention: null,
      sharing: null,
    });
  });

  it("caps very long text", () => {
    const details = readPrivacyNoticeDetails({ privacyNotice: { retention: "a".repeat(5000) } });
    expect(details.retention?.length).toBe(600);
  });

  it("uses the owner's words in the notice when given", () => {
    const notice = clientPrivacyNotice({
      ...input,
      retention: "We delete enquiries 12 months after our last contact",
      sharing: "Our scheduling app.",
    });
    const body = text(notice);
    expect(body).toContain("We delete enquiries 12 months after our last contact.");
    expect(body).toContain("Other companies that receive your details: Our scheduling app.");
    expect(notice.missing).not.toContain("How long enquiries and bookings are kept");
    expect(notice.missing).not.toContain("Other companies the business shares your details with");
  });

  it("keeps the placeholders when the owner has not answered", () => {
    const notice = clientPrivacyNotice({ ...input, retention: "  ", sharing: null });
    const body = text(notice);
    expect(body).toContain(placeholder("How long enquiries and bookings are kept"));
    expect(body).toContain(placeholder("Other companies the business shares your details with"));
    expect(notice.missing).toContain("How long enquiries and bookings are kept");
  });
});
