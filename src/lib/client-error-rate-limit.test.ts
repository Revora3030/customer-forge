import { beforeEach, describe, expect, it } from "vitest";
import {
  CLIENT_ERROR_RATE_LIMIT,
  CLIENT_ERROR_RATE_WINDOW_MS,
  clientErrorIp,
  clientErrorRateLimited,
  resetClientErrorRateLimit,
} from "./client-error-rate-limit";

describe("client error report rate limit", () => {
  beforeEach(() => resetClientErrorRateLimit());

  it("allows up to the limit per window, then throttles", () => {
    const now = 1_000_000;
    for (let i = 0; i < CLIENT_ERROR_RATE_LIMIT; i += 1) {
      expect(clientErrorRateLimited("1.2.3.4", now + i)).toBe(false);
    }
    expect(clientErrorRateLimited("1.2.3.4", now + CLIENT_ERROR_RATE_LIMIT)).toBe(true);
    // A different connection is unaffected.
    expect(clientErrorRateLimited("5.6.7.8", now)).toBe(false);
  });

  it("recovers after the window passes", () => {
    const now = 2_000_000;
    for (let i = 0; i < CLIENT_ERROR_RATE_LIMIT; i += 1) clientErrorRateLimited("ip", now);
    expect(clientErrorRateLimited("ip", now + 1)).toBe(true);
    expect(clientErrorRateLimited("ip", now + CLIENT_ERROR_RATE_WINDOW_MS + 1)).toBe(false);
  });

  it("only trusts edge-controlled IP headers", () => {
    expect(clientErrorIp(new Headers({ "x-forwarded-for": "9.9.9.9" }))).toBe("unknown");
    expect(clientErrorIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientErrorIp(new Headers({ "true-client-ip": "2.2.2.2" }))).toBe("2.2.2.2");
  });
});
