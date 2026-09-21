import { describe, expect, it } from "vitest";
import { validatePublicWebsiteUrl } from "@/lib/audit/website-audit";

describe("website audit URL validation", () => {
  it("normalises a bare public hostname", () => {
    expect(validatePublicWebsiteUrl("example.com").toString()).toBe("https://example.com/");
  });

  it("rejects localhost and private IPv4 literals", () => {
    expect(() => validatePublicWebsiteUrl("http://localhost:3000")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://192.168.1.10")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://127.0.0.1")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://[::1]")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://metadata.google.internal")).toThrow();
  });

  it("rejects credentials in URLs", () => {
    const url = validatePublicWebsiteUrl("https://user:password@example.com");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
  });
});
