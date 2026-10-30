import { describe, expect, it } from "vitest";
import {
  CONTACT_EMAIL_LIMIT_PER_10_MIN,
  CONTACT_IP_LIMIT_PER_HOUR,
  isContactThrottled,
} from "./contact.functions";

describe("contact form abuse limits", () => {
  it("allows a normal sender", () => {
    expect(isContactThrottled({ byEmail: 0, byIp: 0 })).toBe(false);
    expect(isContactThrottled({ byEmail: null, byIp: null })).toBe(false);
  });

  it("throttles one address sending repeatedly", () => {
    expect(isContactThrottled({ byEmail: CONTACT_EMAIL_LIMIT_PER_10_MIN, byIp: 0 })).toBe(true);
  });

  it("throttles one connection rotating email addresses", () => {
    expect(isContactThrottled({ byEmail: 0, byIp: CONTACT_IP_LIMIT_PER_HOUR })).toBe(true);
    expect(isContactThrottled({ byEmail: 0, byIp: CONTACT_IP_LIMIT_PER_HOUR - 1 })).toBe(false);
  });
});
