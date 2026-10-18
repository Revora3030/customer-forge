import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "@react-email/render";

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(async () => ({ sent: true })),
}));

import { sendLeadAlert } from "@/lib/messaging.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { template as leadAlert } from "@/lib/email-templates/lead-alert";

const LEAD_ID = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";

const lastCall = () => {
  const call = vi.mocked(sendTemplateEmail).mock.calls.at(-1);
  if (!call) throw new Error("sendTemplateEmail was not called");
  return { template: call[0], to: call[1], options: call[2] ?? {} };
};

describe("sendLeadAlert is actionable", () => {
  beforeEach(() => vi.mocked(sendTemplateEmail).mockClear());

  it("replies to the visitor and keeps the per-lead idempotency key", async () => {
    const result = await sendLeadAlert(
      "owner@acme.test",
      { kind: "Quote request", leadName: "Sam", leadEmail: " sam@visitor.test " },
      `lead-alert-${LEAD_ID}`,
    );
    expect(result).toEqual({ ok: true });
    const { template, to, options } = lastCall();
    expect(template).toBe("lead-alert");
    expect(to).toBe("owner@acme.test");
    expect(options.idempotencyKey).toBe(`lead-alert-${LEAD_ID}`);
    expect(options.replyTo).toBe("sam@visitor.test");
    expect(options.templateData?.["leadUrl"]).toBe(
      `https://revoragrowthsystems.com/app/leads?lead=${LEAD_ID}`,
    );
  });

  it("prefers an explicit replyTo and ignores an invalid visitor email", async () => {
    await sendLeadAlert("owner@acme.test", { leadEmail: "visitor@x.test" }, `lead-alert-${LEAD_ID}`, "explicit@acme.test");
    expect(lastCall().options.replyTo).toBe("explicit@acme.test");

    await sendLeadAlert("owner@acme.test", { leadEmail: "not an email" }, `lead-alert-${LEAD_ID}`);
    expect(lastCall().options).not.toHaveProperty("replyTo");
  });

  it("adds no lead link for keys that are not a lead alert (e.g. the test alert)", async () => {
    const data = { kind: "Test booking alert", leadName: "Test Customer" };
    await sendLeadAlert("owner@acme.test", data, "notify-test-org-1700000000000");
    const { options } = lastCall();
    expect(options.idempotencyKey).toBe("notify-test-org-1700000000000");
    expect(options.templateData).toEqual(data);
  });

  it("reports provider refusal truthfully", async () => {
    vi.mocked(sendTemplateEmail).mockResolvedValueOnce({ sent: false, reason: "recipient_suppressed" });
    const result = await sendLeadAlert("owner@acme.test", {}, `lead-alert-${LEAD_ID}`);
    expect(result).toEqual({ ok: false, retry: false, reason: "recipient_suppressed" });
  });
});

describe("lead-alert template", () => {
  it("renders the lead link plus tel: and mailto: actions", async () => {
    const html = await render(
      React.createElement(leadAlert.component, {
        kind: "Quote request",
        leadName: "Sam",
        leadEmail: "sam@visitor.test",
        leadPhone: "+1 (919) 555-0134",
        leadUrl: `https://revoragrowthsystems.com/app/leads?lead=${LEAD_ID}`,
      }),
    );
    expect(html).toContain("Open this lead");
    expect(html).toContain(`https://revoragrowthsystems.com/app/leads?lead=${LEAD_ID}`);
    expect(html).toContain('href="tel:+19195550134"');
    expect(html).toContain('href="mailto:sam@visitor.test"');
  });

  it("drops a non-https lead link", async () => {
    const html = await render(
      React.createElement(leadAlert.component, { leadName: "Sam", leadUrl: "javascript:alert(1)" }),
    );
    expect(html).not.toContain("Open this lead");
    expect(html).not.toContain("javascript:");
  });
});
