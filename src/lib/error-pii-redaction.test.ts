import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monitoring.functions", () => ({ reportClientError: vi.fn() }));

import { sanitizeErrorText } from "@/lib/monitoring.server";
import { safeRoutePath } from "@/lib/route-error-reporting";

describe("error report redaction", () => {
  it("strips share-preview and invite tokens from route paths", () => {
    expect(safeRoutePath("/p/AbCdEf0123456789xyz")).toBe("/p/[token]");
    expect(safeRoutePath("/p/AbCdEf0123456789xyz/services")).toBe("/p/[token]/services");
    expect(safeRoutePath("/invite/tok_123456789abc")).toBe("/invite/[token]");
    expect(safeRoutePath("/app/website")).toBe("/app/website");
    expect(safeRoutePath("/s/acme/about")).toBe("/s/acme/about");
  });

  it("redacts emails, phone numbers, JWTs and token paths from messages", () => {
    const out = sanitizeErrorText(
      "Failed for jane.doe@example.com (+1 919-555-0100) at https://x.dev/p/AbCdEf0123456789xyz token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJlX3h5",
    )!;
    expect(out).not.toContain("jane.doe@example.com");
    expect(out).not.toContain("919-555-0100");
    expect(out).not.toContain("AbCdEf0123456789xyz");
    expect(out).not.toContain("eyJhbGciOiJIUzI1");
    expect(out).toContain("[email]");
    expect(out).toContain("/p/[token]");
  });

  it("keeps ordinary diagnostic text readable", () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'sections') at line 120:14";
    expect(sanitizeErrorText(text)).toBe(text);
  });
});
