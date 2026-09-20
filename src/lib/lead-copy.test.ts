/**
 * Every lead must also reach Revora's own inbox, and must never be emailed
 * there twice when the business already alerts that same address.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; key: string | undefined }[] = [];

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: async (_template: string, to: string, options: { idempotencyKey?: string }) => {
    sent.push({ to, key: options.idempotencyKey });
    return { sent: true as const };
  },
}));

describe("lead copy to Revora", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("sends a copy when the business alerts a different inbox", async () => {
    const { sendLeadAlertCopyToRevora } = await import("@/lib/messaging.server");
    const { REVORA } = await import("@/lib/brand");
    const copy = await sendLeadAlertCopyToRevora({ leadName: "Jordan" }, "lead-alert-1", "owner@example.com");
    expect(copy?.recipient).toBe(REVORA.email);
    expect(copy?.result.ok).toBe(true);
    expect(sent).toEqual([{ to: REVORA.email, key: "lead-alert-1-revora-copy" }]);
  });

  it("sends a copy even when the business has no alert inbox at all", async () => {
    const { sendLeadAlertCopyToRevora } = await import("@/lib/messaging.server");
    const copy = await sendLeadAlertCopyToRevora({ leadName: "Jordan" }, "lead-alert-2", null);
    expect(copy?.result.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("never emails the same inbox twice", async () => {
    const { sendLeadAlertCopyToRevora } = await import("@/lib/messaging.server");
    const { REVORA } = await import("@/lib/brand");
    const copy = await sendLeadAlertCopyToRevora(
      { leadName: "Jordan" },
      "lead-alert-3",
      REVORA.email.toUpperCase(),
    );
    expect(copy).toBeNull();
    expect(sent).toEqual([]);
  });
});
