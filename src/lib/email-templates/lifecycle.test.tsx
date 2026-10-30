import React from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  lifecycleBookingFollowUpTemplate,
  lifecycleSetupReminderTemplate,
  lifecycleWelcomeTemplate,
  lifecycleWinbackTemplate,
} from "./lifecycle";
import { FULL_ACCESS_TRIAL_DAYS } from "@/lib/offer";

const html = (entry: { component: React.ComponentType<Record<string, unknown>> }, data: Record<string, unknown>) =>
  render(React.createElement(entry.component, data));

describe("lifecycle email templates", () => {
  it("state the real trial length", async () => {
    const welcome = await html(lifecycleWelcomeTemplate as never, { trialEnds: "November 2, 2026" });
    expect(welcome).toContain(`${FULL_ACCESS_TRIAL_DAYS}-day free full access`);
    const reminder = await html(lifecycleSetupReminderTemplate as never, { daysLeft: 2, trialEnds: "November 2, 2026" });
    expect(reminder).toContain(`${FULL_ACCESS_TRIAL_DAYS}-day free full access`);
    expect(welcome).not.toMatch(/\b(7|14|30)-day free/);
  });

  it("carry the recipient's unsubscribe link in every email", async () => {
    const url = "https://revoragrowthsystems.com/unsubscribe/lifecycle/abc123abc123abc123abc123";
    for (const entry of [lifecycleWelcomeTemplate, lifecycleSetupReminderTemplate, lifecycleBookingFollowUpTemplate, lifecycleWinbackTemplate]) {
      const out = await html(entry as never, { unsubscribeUrl: url });
      expect(out).toContain(url);
      expect(out).toContain("Unsubscribe");
    }
  });
});
