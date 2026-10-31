import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "./website-url";

const ok = (input: string) => {
  const result = normalizeWebsiteUrl(input);
  return result.ok ? result.url : null;
};

describe("normalizeWebsiteUrl", () => {
  it("adds https and tidies a bare domain", () => {
    expect(ok("  YourBusiness.com ")).toBe("https://yourbusiness.com");
    expect(ok("www.example.org/services?x=1")).toBe("https://www.example.org/services?x=1");
  });

  it("keeps an explicit http or https scheme and drops credentials and fragments", () => {
    expect(ok("http://example.com/about#team")).toBe("http://example.com/about"); // DevSkim: ignore DS137138 -- deliberate test: explicit http scheme is kept.
    expect(ok("https://user:pw@example.com/")).toBe("https://example.com");
  });

  it("rejects empty, spaced or over-long input", () => {
    expect(ok("")).toBeNull();
    expect(ok("my site.com")).toBeNull();
    expect(ok(`${"a".repeat(220)}.com`)).toBeNull();
  });

  it("rejects non-web schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "ftp://example.com",
      "file:///etc/passwd",
      "data:text/html,hi",
      "mailto:a@b.co",
    ]) {
      expect(ok(bad), bad).toBeNull();
    }
  });

  it("rejects private, loopback, metadata and IP-literal hosts", () => {
    for (const bad of [
      "localhost", // DevSkim: ignore DS162092 -- deliberate negative test: this address must be refused or normalized.
      "http://127.0.0.1", // DevSkim: ignore DS162092,DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://10.0.0.5/admin", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://192.168.1.1", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://169.254.169.254/latest/meta-data", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://[::1]/", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://2130706433", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "http://0x7f000001", // DevSkim: ignore DS137138 -- deliberate negative test: this address must be refused or normalized.
      "printer.local",
      "db.internal",
      "metadata.google.internal",
      "intranet",
    ]) {
      expect(ok(bad), bad).toBeNull();
    }
  });
});
