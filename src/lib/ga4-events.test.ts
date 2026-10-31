import { afterEach, describe, expect, it, vi } from "vitest";

const ga4Event = vi.fn();
vi.mock("./ga4", () => ({ ga4Event }));

afterEach(() => ga4Event.mockClear());

describe("GA4 conversion events", () => {
  it("sends generate_lead with its source", async () => {
    const { ga4GenerateLead } = await import("./ga4-events");
    ga4GenerateLead("contact_form");
    expect(ga4Event).toHaveBeenCalledWith("generate_lead", { lead_source: "contact_form" });
  });
  it("sends sign_up with the method", async () => {
    const { ga4SignUp } = await import("./ga4-events");
    ga4SignUp("email");
    expect(ga4Event).toHaveBeenCalledWith("sign_up", { method: "email" });
  });
});
