import { describe, expect, it } from "vitest";
import { OUTREACH_DAILY_MAX, parseEmailDraft, rawEmail, validEmail } from "./prospect-outreach.server";

const decode = (raw: string) => new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

describe("Jarvis demo outreach", () => {
  it("never sends more than 40 a day", () => {
    expect(OUTREACH_DAILY_MAX).toBe(40);
  });

  it("strips line breaks from headers so a business name can't inject recipients", () => {
    const message = decode(rawEmail("a@b.com\r\nBcc: x@y.com", "Hi\r\nBcc: z@y.com", "body", "Revora"));
    expect(message).not.toMatch(/\r\nBcc:/);
  });

  it("rejects invalid addresses and lowercases valid ones", () => {
    expect(validEmail("Owner@Biz.COM")).toBe("owner@biz.com");
    expect(validEmail("not-an-email")).toBeNull();
    expect(validEmail("a@b.com, c@d.com")).toBeNull();
  });

  it("only accepts an AI draft that contains the preview link", () => {
    const url = "https://revoragrowthsystems.com/p/abc";
    expect(parseEmailDraft('{"subject":"s","body":"no link"}', url)).toBeNull();
    expect(parseEmailDraft(`{"subject":"s","body":"see ${url}"}`, url)).not.toBeNull();
  });
});
