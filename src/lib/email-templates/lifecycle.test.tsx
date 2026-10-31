import React from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  lifecycleBookingFollowUpTemplate,
  lifecycleSetupReminderTemplate,
  lifecycleSiteReadyTemplate,
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
    for (const entry of [lifecycleWelcomeTemplate, lifecycleSetupReminderTemplate, lifecycleBookingFollowUpTemplate, lifecycleSiteReadyTemplate, lifecycleWinbackTemplate]) {
      const out = await html(entry as never, { unsubscribeUrl: url });
      expect(out).toContain(url);
      expect(out).toContain("Unsubscribe");
    }
  });

  it("site-ready email calls the build a draft, links to the website page and never claims it is live", async () => {
    const out = await html(lifecycleSiteReadyTemplate as never, { businessName: "Acme Plumbing", firstName: "Sam" });
    expect(out).toContain("Acme Plumbing");
    expect(out).toContain("draft");
    expect(out).toContain("https://revoragrowthsystems.com/app/website");
    expect(out).not.toMatch(/is live|now live|went live/i);
    expect(lifecycleSiteReadyTemplate.subject()).toBe("Your website draft is ready to review");
  });
});
