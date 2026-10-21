import { describe, expect, it } from "vitest";
import { claimOwnership } from "./prospect-claim";

describe("prospect demo claim ownership", () => {
  it("allows the exact business email", () => expect(claimOwnership("Owner@Shop.com", "owner@shop.com")).toMatchObject({ allowed: true, verified: true }));
  it("allows the same business domain", () => expect(claimOwnership("info@shop.com", "jane@shop.com")).toMatchObject({ allowed: true, method: "domain_match" }));
  it("blocks a stranger holding a forwarded link", () => expect(claimOwnership("info@shop.com", "someone@gmail.com").allowed).toBe(false));
  it("does not treat a shared free-mail domain as the business", () => expect(claimOwnership("shop@gmail.com", "other@gmail.com").allowed).toBe(false));
  it("allows but marks unverified when no email is on file", () => expect(claimOwnership(null, "a@b.com")).toMatchObject({ allowed: true, verified: false }));
});
