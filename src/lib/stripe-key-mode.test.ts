import { describe, expect, it } from "vitest";
import { assertKeyMatchesEnv, signatureMatches } from "@/lib/stripe.server";

describe("assertKeyMatchesEnv", () => {
  it("allows test keys in sandbox", () => {
    expect(() => assertKeyMatchesEnv("sk_test_" + "abc", "sandbox")).not.toThrow();
    expect(() => assertKeyMatchesEnv("rk_test_" + "abc", "sandbox")).not.toThrow();
  });
  it("refuses live keys in sandbox without echoing the key", () => {
    try {
      assertKeyMatchesEnv("sk_live_" + "SECRETVALUE", "sandbox");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/not a test-mode key/);
      expect((e as Error).message).not.toContain("SECRETVALUE");
    }
  });
  it("refuses test or malformed keys for live", () => {
    expect(() => assertKeyMatchesEnv("sk_test_" + "abc", "live")).toThrow(/not a live-mode key/);
    expect(() => assertKeyMatchesEnv("garbage", "sandbox")).toThrow();
  });
  it("allows live keys for live", () => {
    expect(() => assertKeyMatchesEnv("sk_live_" + "abc", "live")).not.toThrow();
  });
});

describe("signatureMatches", () => {
  it("matches any equal candidate and rejects others", () => {
    expect(signatureMatches("abcd", ["ffff", "abcd"])).toBe(true);
    expect(signatureMatches("abcd", ["abce", "abc"])).toBe(false);
    expect(signatureMatches("abcd", [])).toBe(false);
  });
});
