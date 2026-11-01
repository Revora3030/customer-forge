import { describe, expect, it } from "vitest";
import { formatUsPhone } from "./format";

describe("formatUsPhone", () => {
  it("formats a US number as (919) 555-0123 from any common shape", () => {
    for (const value of ["9195550123", "919-555-0123", "(919) 555-0123", "919.555.0123", "+1 919 555 0123", "+19195550123", "1-919-555-0123", " 919 555 0123 "]) {
      expect(formatUsPhone(value), value).toBe("(919) 555-0123");
    }
  });

  it("leaves non-US numbers exactly as they were", () => {
    for (const value of ["+44 20 7946 0958", "+61 412 345 678", "020 7946 0958", "+33 1 23 45 67 89"]) {
      expect(formatUsPhone(value), value).toBe(value);
    }
  });

  it("leaves partial numbers, extensions, and text untouched", () => {
    for (const value of ["555-0123", "919555012", "9195550123 ext 4", "call me", "0195550123"]) {
      expect(formatUsPhone(value), value).toBe(value);
    }
  });

  it("keeps empty values empty", () => {
    expect(formatUsPhone(null)).toBe("");
    expect(formatUsPhone(undefined)).toBe("");
    expect(formatUsPhone("")).toBe("");
  });
});
