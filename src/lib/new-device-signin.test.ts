import { describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  hashDeviceId,
  isNewDeviceEmailEnabled,
  newDeviceEmailCopy,
  normalizeCountry,
  shouldSendNewDeviceAlert,
  getOrCreateDeviceId,
  DEVICE_STORAGE_KEY,
} from "./new-device-signin";

describe("isNewDeviceEmailEnabled", () => {
  it("is OFF by default", () => {
    expect(isNewDeviceEmailEnabled({})).toBe(false);
    expect(isNewDeviceEmailEnabled({ REVORA_NEW_DEVICE_EMAIL: "0" })).toBe(false);
    expect(isNewDeviceEmailEnabled({ REVORA_NEW_DEVICE_EMAIL: "true" })).toBe(false);
  });
  it("turns on only for exact 1", () => {
    expect(isNewDeviceEmailEnabled({ REVORA_NEW_DEVICE_EMAIL: "1" })).toBe(true);
  });
});

describe("normalizeCountry", () => {
  it("keeps two-letter codes", () => {
    expect(normalizeCountry("us")).toBe("US");
    expect(normalizeCountry(" GB ")).toBe("GB");
  });
  it("maps missing / cloudflare placeholders to unknown", () => {
    expect(normalizeCountry(null)).toBe("unknown");
    expect(normalizeCountry("")).toBe("unknown");
    expect(normalizeCountry("XX")).toBe("unknown");
    expect(normalizeCountry("T1")).toBe("unknown");
    expect(normalizeCountry("USA")).toBe("unknown");
  });
});

describe("shouldSendNewDeviceAlert", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("never sends when disabled", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: false,
        deviceCountBefore: 3,
        knownDevice: false,
        countryChanged: false,
        lastAlertAt: null,
        now,
      }),
    ).toEqual({ send: false, reason: "disabled" });
  });
  it("skips the first device ever (new account)", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 0,
        knownDevice: false,
        countryChanged: false,
        lastAlertAt: null,
        now,
      }),
    ).toEqual({ send: false, reason: "first_device" });
  });
  it("skips a known device in the same country", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 1,
        knownDevice: true,
        countryChanged: false,
        lastAlertAt: null,
        now,
      }),
    ).toEqual({ send: false, reason: "known_device" });
  });
  it("alerts on a new device", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 1,
        knownDevice: false,
        countryChanged: false,
        lastAlertAt: null,
        now,
      }),
    ).toEqual({ send: true, reason: "new_device" });
  });
  it("alerts when a known device changes country", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 2,
        knownDevice: true,
        countryChanged: true,
        lastAlertAt: null,
        now,
      }),
    ).toEqual({ send: true, reason: "new_country" });
  });
  it("caps at one email per day", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 2,
        knownDevice: false,
        countryChanged: false,
        lastAlertAt: new Date(now.getTime() - ALERT_COOLDOWN_MS + 60_000).toISOString(),
        now,
      }),
    ).toEqual({ send: false, reason: "cooldown" });
  });
  it("allows another email after the cooldown", () => {
    expect(
      shouldSendNewDeviceAlert({
        enabled: true,
        deviceCountBefore: 2,
        knownDevice: false,
        countryChanged: false,
        lastAlertAt: new Date(now.getTime() - ALERT_COOLDOWN_MS - 1).toISOString(),
        now,
      }),
    ).toEqual({ send: true, reason: "new_device" });
  });
});

describe("hashDeviceId", () => {
  it("returns a 64-char hex and is stable", async () => {
    const a = await hashDeviceId("user-1", "device-a");
    const b = await hashDeviceId("user-1", "device-a");
    const c = await hashDeviceId("user-1", "device-b");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("getOrCreateDeviceId", () => {
  it("reuses a stored id", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const first = getOrCreateDeviceId(storage);
    const second = getOrCreateDeviceId(storage);
    expect(first).toBe(second);
    expect(store.get(DEVICE_STORAGE_KEY)).toBe(first);
  });
});

describe("newDeviceEmailCopy", () => {
  it("names the country when known", () => {
    const copy = newDeviceEmailCopy("US");
    expect(copy.heading).toMatch(/New sign-in/i);
    expect(copy.message).toContain("US");
    expect(copy.message).toMatch(/country|Cloudflare/i);
    expect(copy.message).not.toMatch(/user-agent|fingerprint id/i);
  });
});
