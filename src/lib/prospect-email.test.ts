import { describe, expect, it } from "vitest";
import { extractBusinessEmail } from "./prospect-email";

describe("public email extraction", () => {
  it("reads a mailto link", () => {
    expect(extractBusinessEmail('<a href="mailto:Joe@JoesDetail.com">Email</a>')).toBe("joe@joesdetail.com");
  });
  it("ignores platform addresses", () => {
    expect(extractBusinessEmail("contact privacy@facebook.com or noreply@shop.com")).toBeNull();
  });
  it("returns null when no email is shown", () => {
    expect(extractBusinessEmail("<p>Call us today</p>")).toBeNull();
  });
});
