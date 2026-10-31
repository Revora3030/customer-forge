import { describe, expect, it } from "vitest";
import { contactStepValid, continueHint } from "./onboarding-validation";

describe("contactStepValid", () => {
  it("needs a contact method", () => {
    expect(contactStepValid("", "")).toBe(false);
    expect(contactStepValid("(555) 019-4420", "")).toBe(true);
    expect(contactStepValid("", "hello@shop.com")).toBe(true);
  });
  it("rejects anything typed that looks wrong", () => {
    expect(contactStepValid("12345", "")).toBe(false);
    expect(contactStepValid("", "not-an-email")).toBe(false);
    expect(contactStepValid("(555) 019-4420", "bad@")).toBe(false);
  });
});

describe("continueHint", () => {
  const base = { businessName: "", city: "", phone: "", email: "", goals: [] };
  it("explains the disabled steps", () => {
    expect(continueHint(0, base)).toMatch(/business name and city/);
    expect(continueHint(3, base)).toMatch(/phone number or an email/);
    expect(continueHint(3, { ...base, email: "x" })).toMatch(/doesn't look right/);
    expect(continueHint(5, base)).toMatch(/at least one/);
  });
});
