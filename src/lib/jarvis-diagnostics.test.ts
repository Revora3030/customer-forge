import { describe, expect, it } from "vitest";
import { redactDiagnosticText } from "./jarvis-diagnostics.server";

describe("Jarvis diagnostic redaction", () => {
  it.each([
    "sb_secret_fixture", "sk_live_fixture", "sk_test_fixture",
    "whsec_fixture", "sk-proj-fixture", "lov_fixture",
  ])("removes recognized credential %s", (secret) => {
    expect(redactDiagnosticText(`error ${secret}`)).not.toContain(secret);
  });

  it("removes bearer tokens and email addresses", () => {
    expect(redactDiagnosticText("Bearer fixture-token")).not.toContain("fixture-token");
    expect(redactDiagnosticText("owner@example.test")).not.toContain("owner@example.test");
  });

  it("strips URL credentials and query values before email redaction", () => {
    const input = "https://user:password@example.test/path?token=private#fragment";
    expect(redactDiagnosticText(input)).toBe("https://example.test/path");
  });

  it("strips secret-shaped query values without leaving query fragments", () => {
    expect(redactDiagnosticText("https://example.test/path?key=sb_secret_fixture"))
      .toBe("https://example.test/path");
  });

  it("limits diagnostic excerpts and preserves ordinary errors", () => {
    expect(redactDiagnosticText("a".repeat(1000))).toHaveLength(240);
    expect(redactDiagnosticText("plain failure")).toBe("plain failure");
  });
});
