import { describe, expect, it, vi } from "vitest";
import {
  announceNewLead,
  readChimeOn,
  shouldAlertNewLead,
  whatsappLink,
  writeChimeOn,
} from "@/lib/lead-chime";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const fresh = { source: "website", created_at: "2026-11-01T11:59:30Z" };

describe("shouldAlertNewLead", () => {
  it("alerts for a fresh real lead", () => expect(shouldAlertNewLead(fresh, NOW)).toBe(true));
  it("never alerts for a test lead", () =>
    expect(shouldAlertNewLead({ ...fresh, source: "test_lead" }, NOW)).toBe(false));
  it("ignores an old row (no alert on load of old leads)", () =>
    expect(shouldAlertNewLead({ ...fresh, created_at: "2026-11-01T10:00:00Z" }, NOW)).toBe(false));
  it("ignores an empty payload", () => expect(shouldAlertNewLead(null, NOW)).toBe(false));
});

describe("announceNewLead", () => {
  const make = (on: boolean) => ({
    notifyInfo: vi.fn(),
    chimeOn: () => on,
    play: vi.fn(),
    now: NOW,
  });
  it("toasts but stays silent while sound is off", async () => {
    const d = make(false);
    expect(await announceNewLead(fresh, d)).toBe(true);
    expect(d.notifyInfo).toHaveBeenCalledOnce();
    expect(d.play).not.toHaveBeenCalled();
  });
  it("chimes when sound is on", async () => {
    const d = make(true);
    await announceNewLead(fresh, d);
    expect(d.play).toHaveBeenCalledOnce();
  });
  it("does nothing for a test lead", async () => {
    const d = make(true);
    expect(await announceNewLead({ ...fresh, source: "test_lead" }, d)).toBe(false);
    expect(d.notifyInfo).not.toHaveBeenCalled();
    expect(d.play).not.toHaveBeenCalled();
  });
  it("a failing preference read means no sound, still a toast", async () => {
    const d = { ...make(true), chimeOn: () => Promise.reject(new Error("x")) };
    await announceNewLead(fresh, d);
    expect(d.notifyInfo).toHaveBeenCalledOnce();
    expect(d.play).not.toHaveBeenCalled();
  });
});

describe("chime preference", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("is off by default and remembered per user", () => {
    const s = store();
    expect(readChimeOn(s, "u1")).toBe(false);
    writeChimeOn(s, "u1", true);
    expect(readChimeOn(s, "u1")).toBe(true);
    expect(readChimeOn(s, "u2")).toBe(false);
    writeChimeOn(s, "u1", false);
    expect(readChimeOn(s, "u1")).toBe(false);
  });
  it("is off when storage is unavailable", () => expect(readChimeOn(null, "u1")).toBe(false));
});

describe("whatsappLink", () => {
  it("builds a wa.me link from digits only", () => {
    expect(whatsappLink("(305) 555-0123")).toBe("https://wa.me/13055550123");
    expect(whatsappLink("1 305 555 0123")).toBe("https://wa.me/13055550123");
    expect(whatsappLink("+44 20 7946 0958")).toBe("https://wa.me/442079460958");
  });
  it("gives no link when the country can't be told or there is no phone", () => {
    expect(whatsappLink("555-0123")).toBeNull();
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("+123")).toBeNull();
  });
});
