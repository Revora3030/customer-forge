import { describe, expect, it } from "vitest";
import { createSoftRateLimiter, publicLeadSoftLimiter } from "./soft-rate-limit.server";

describe("soft rate limiter", () => {
  it("allows up to the limit per window, then refuses", () => {
    const limiter = createSoftRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3, 4].map(() => limiter.hit("ip", 0))).toEqual([true, true, true, false]);
  });

  it("resets after the window", () => {
    const limiter = createSoftRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("ip", 0)).toBe(true);
    expect(limiter.hit("ip", 999)).toBe(false);
    expect(limiter.hit("ip", 1000)).toBe(true);
  });

  it("keeps keys independent", () => {
    const limiter = createSoftRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("b", 0)).toBe(true);
    expect(limiter.hit("a", 1)).toBe(false);
  });

  it("bounds memory by evicting the least recently hit keys", () => {
    const limiter = createSoftRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const key of ["a", "b", "c", "d"]) limiter.hit(key, 0);
    expect(limiter.size()).toBe(3);
    // "a" was evicted, so it starts fresh.
    expect(limiter.hit("a", 1)).toBe(true);
  });

  it("the public lead limiter is generous enough for real visitors", () => {
    const key = `test|${Math.random()}`;
    for (let i = 0; i < 20; i += 1) expect(publicLeadSoftLimiter.hit(key)).toBe(true);
    expect(publicLeadSoftLimiter.hit(key)).toBe(false);
  });
});
