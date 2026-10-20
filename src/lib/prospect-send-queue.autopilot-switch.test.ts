import { describe, expect, it } from "vitest";
import { autopilotChannelAllowed, readAutopilotSwitches } from "./prospect-send-queue.server";

const dbReturning = (data: unknown, error: unknown = null) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) }) as never;

describe("queued automatic outreach respects the owner's autopilot switches", () => {
  it("autopilot off stops every queued automatic send", () => {
    expect(autopilotChannelAllowed({ enabled: false, sendEmail: true, sendSms: true }, "email")).toBe(false);
  });
  it("a channel switched off stops that channel only", () => {
    const s = { enabled: true, sendEmail: true, sendSms: false };
    expect(autopilotChannelAllowed(s, "email")).toBe(true);
    expect(autopilotChannelAllowed(s, "sms")).toBe(false);
  });
  it("unreadable settings are treated as off", async () => {
    expect(await readAutopilotSwitches(dbReturning(null, { message: "boom" }))).toEqual({ enabled: false, sendEmail: false, sendSms: false });
    expect(autopilotChannelAllowed(null, "email")).toBe(false);
  });
  it("reads the saved switches", async () => {
    expect(await readAutopilotSwitches(dbReturning({ enabled: true, send_email: true, send_sms: false }))).toEqual({ enabled: true, sendEmail: true, sendSms: false });
  });
});
