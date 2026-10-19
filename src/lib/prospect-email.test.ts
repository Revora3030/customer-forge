import { describe, expect, it } from "vitest";
import { extractBusinessEmail } from "./prospect-email";

describe("public email extraction", () => {
  it("prefers a listed mailto contact and normalizes it", () => {
    expect(extractBusinessEmail('<a href="mailto:Joe@JoesDetail.com">Email</a>')).toBe("joe@joesdetail.com");
  });

  it("ignores platform/system emails rather than treating them as the business contact", () => {
    expect(extractBusinessEmail("contact privacy@facebook.com or noreply@shop.com")).toBeNull();
    expect(extractBusinessEmail("support@shop.com")).toBeNull();
  });

  it("ignores placeholders and file-like addresses", () => {
    expect(extractBusinessEmail("team@example.com logo@shop.com.png")).toBeNull();
  });

  it("decodes common at-sign encodings", () => {
    expect(extractBusinessEmail("owner&#64;shine-detailing.com")).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail("owner%40shine-detailing.com")).toBe("owner@shine-detailing.com");
  });

  it("returns null when the page does not list a business email", () => {
    expect(extractBusinessEmail("<p>Call us today</p>")).toBeNull();
  });
});
