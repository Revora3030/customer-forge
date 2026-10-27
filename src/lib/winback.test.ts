import { describe, expect, it } from "vitest";
import { findDormant, mailHref, quietLabel, smsHref, winbackDraft, winbackTag, type WinbackCustomer } from "./winback";

const NOW = new Date("2026-10-27T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const c = (id: string, over: Partial<WinbackCustomer> = {}): WinbackCustomer => ({
  id, name: "Maria Lopez", email: "m@example.com", phone: "555-010-0199", tags: [],
  created_at: daysAgo(400), last_appointment_at: daysAgo(200), next_appointment_at: null, ...over,
});

describe("findDormant", () => {
  it("lists customers quiet for the window, longest quiet first", () => {
    const { shown, total } = findDormant([c("a", { last_appointment_at: daysAgo(200) }), c("b", { last_appointment_at: daysAgo(400) }), c("recent", { last_appointment_at: daysAgo(30) })], NOW);
    expect(shown.map((x) => x.id)).toEqual(["b", "a"]);
    expect(total).toBe(2);
    expect(shown[0]?.daysQuiet).toBe(400);
  });
  it("falls back to when they became a customer when there was never an appointment", () => {
    expect(findDormant([c("a", { last_appointment_at: null, created_at: daysAgo(300) })], NOW).shown[0]?.daysQuiet).toBe(300);
  });
  it("leaves out opted-out, booked-ahead, contactless and recently messaged people", () => {
    const list = [
      c("optout", { tags: ["Do Not Contact"] }),
      c("booked", { next_appointment_at: new Date(NOW.getTime() + 86_400_000).toISOString() }),
      c("nocontact", { email: null, phone: " " }),
      c("messaged", { tags: [winbackTag(new Date(NOW.getTime() - 10 * 86_400_000))] }),
      c("old-message", { tags: [winbackTag(new Date(NOW.getTime() - 120 * 86_400_000))] }),
    ];
    expect(findDormant(list, NOW).shown.map((x) => x.id)).toEqual(["old-message"]);
  });
  it("honours a different window and ignores future or unreadable dates", () => {
    expect(findDormant([c("a", { last_appointment_at: daysAgo(100) })], NOW, 90).total).toBe(1);
    expect(findDormant([c("a", { last_appointment_at: daysAgo(100) })], NOW, 180).total).toBe(0);
    expect(findDormant([c("f", { last_appointment_at: daysAgo(-5) }), c("x", { last_appointment_at: "nope", created_at: "nope" })], NOW).total).toBe(0);
  });
  it("shows at most 25 but reports the full count", () => {
    const many = Array.from({ length: 40 }, (_, i) => c(`c${i}`));
    const r = findDormant(many, NOW);
    expect(r.shown).toHaveLength(25);
    expect(r.total).toBe(40);
  });
});

describe("drafts and links", () => {
  it("writes a short check-in with an opt-out and only the owner's own offer", () => {
    const d = winbackDraft("Maria Lopez", "Northside Plumbing", "");
    expect(d.text).toBe("Hi Maria, it's Northside Plumbing. It's been a while since we last saw you. Want me to put you on the schedule? Reply STOP and I won't text again.");
    expect(d.emailBody).toContain("If you'd rather not hear from me");
    expect(d.emailSubject).toBe("Checking in from Northside Plumbing");
    expect(winbackDraft("Maria", "N", "10% off this month").text).toContain("10% off this month");
    expect(d.text).not.toMatch(/\d+%|\$/);
  });
  it("falls back to a neutral greeting for odd names", () => {
    expect(winbackDraft("", "N", "").text.startsWith("Hi there,")).toBe(true);
    expect(winbackDraft("1234 LLC", "N", "").text.startsWith("Hi there,")).toBe(true);
  });
  it("builds sms and mail links and rejects unusable contacts", () => {
    expect(smsHref("(555) 010-0199", "hi there")).toBe("sms:5550100199?&body=hi%20there");
    expect(smsHref("12", "x")).toBeNull();
    expect(mailHref("m@example.com", "Hi", "a b")).toBe("mailto:m@example.com?subject=Hi&body=a%20b");
    expect(mailHref("not an email", "s", "b")).toBeNull();
  });
  it("says how long in plain words", () => {
    expect(quietLabel(45)).toBe("45 days");
    expect(quietLabel(200)).toBe("7 months");
    expect(quietLabel(800)).toBe("2 years");
  });
});
