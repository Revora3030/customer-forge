import { describe, expect, it } from "vitest";
import { fingerprintOf, sanitizeContext, sanitizeErrorText } from "@/lib/monitoring.server";

describe("error fingerprinting", () => {
  it("groups the same failure on the same route", () => {
    const a = fingerprintOf({ message: "Timeout after 3000ms", route: "/app" });
    const b = fingerprintOf({ message: "Timeout after 9500ms", route: "/app" });
    expect(a).toBe(b);
  });

  it("separates the same message on different routes", () => {
    expect(fingerprintOf({ message: "boom", route: "/a" })).not.toBe(
      fingerprintOf({ message: "boom", route: "/b" }),
    );
  });

  it("ignores tenant ids so one bug is one issue", () => {
    const a = fingerprintOf({ message: "org 11111111-2222-3333-4444-555555555555 failed" });
    const b = fingerprintOf({ message: "org 99999999-8888-7777-6666-777777777777 failed" });
    expect(a).toBe(b);
  });
});

describe("error context sanitising", () => {
  it("redacts anything credential shaped", () => {
    const out = sanitizeContext({
      stripeApiKey: "sk_live_secret",
      authorization: "Bearer abc",
      orgSlug: "acme-plumbing",
    });
    expect(out["stripeApiKey"]).toBe("[redacted]");
    expect(out["authorization"]).toBe("[redacted]");
    expect(out["orgSlug"]).toBe("acme-plumbing");
  });

  it("bounds long values", () => {
    const out = sanitizeContext({ note: "x".repeat(2000) });
    expect(String(out["note"]).length).toBe(500);
  });
});

describe("error text sanitising", () => {
  it("redacts secrets embedded in URLs and headers", () => {
    const input =
      "GET https://example.com/callback?access_token=super-secret&code=one-time-code failed; Authorization: Bearer abcdefghijklmnop";
    const out = sanitizeErrorText(input);

    expect(out).toContain("access_token=[redacted]");
    expect(out).toContain("code=[redacted]");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("super-secret");
    expect(out).not.toContain("one-time-code");
    expect(out).not.toContain("abcdefghijklmnop");
  });

  it("redacts known provider credential formats", () => {
    const stripeKey = ["sk_live_", "abcdefghijklmnopqrstuvwxyz"].join("");
    const webhookSecret = ["whsec_", "abcdefghijklmnopqrstuvwxyz"].join("");
    const out = sanitizeErrorText(`${stripeKey} ${webhookSecret}`);
    expect(out).toBe("[redacted] [redacted]");
  });
});
