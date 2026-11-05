import { describe, expect, it } from "vitest";
import {
  cleanCode,
  isCompleteCode,
  isTwoFactorUnavailable,
  needsSecondFactor,
  unverifiedTotpFactors,
  verifiedTotpFactors,
} from "@/lib/two-factor";

describe("needsSecondFactor", () => {
  it("never asks accounts without an authenticator (sign-in unchanged)", () => {
    expect(needsSecondFactor({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(needsSecondFactor(null)).toBe(false);
    expect(needsSecondFactor(undefined)).toBe(false);
  });
  it("asks for the code when a verified authenticator exists and it wasn't used yet", () => {
    expect(needsSecondFactor({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
  });
  it("stops asking once the code was entered", () => {
    expect(needsSecondFactor({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });
});

describe("factor filters", () => {
  const factors = [
    { id: "a", factor_type: "totp", status: "verified" },
    { id: "b", factor_type: "totp", status: "unverified" },
    { id: "c", factor_type: "phone", status: "verified" },
  ];
  it("splits verified and abandoned authenticator set-ups", () => {
    expect(verifiedTotpFactors(factors).map((f) => f.id)).toEqual(["a"]);
    expect(unverifiedTotpFactors(factors).map((f) => f.id)).toEqual(["b"]);
    expect(verifiedTotpFactors(null)).toEqual([]);
  });
});

describe("isTwoFactorUnavailable", () => {
  it("treats a disabled MFA project setting as coming soon", () => {
    expect(isTwoFactorUnavailable({ message: "MFA enroll is disabled for TOTP" })).toBe(true);
    expect(isTwoFactorUnavailable({ code: "mfa_totp_enroll_not_enabled", message: "x" })).toBe(true);
    expect(isTwoFactorUnavailable("TOTP factor is not enabled")).toBe(true);
  });
  it("does not hide real errors", () => {
    expect(isTwoFactorUnavailable({ message: "Network request failed" })).toBe(false);
    expect(isTwoFactorUnavailable(null)).toBe(false);
  });
});

describe("codes", () => {
  it("keeps digits only, max six", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("12-34-56-78")).toBe("123456");
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345")).toBe(false);
  });
});
