import { describe, expect, it } from "vitest";
import { WEBHOOK_RETRY_BACKOFF_MS, pickWebhookRetries, type DeliveryLogRow } from "@/lib/lead-webhook-retry.server";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

const row = (over: Partial<DeliveryLogRow>): DeliveryLogRow => ({
  organization_id: "org-a",
  lead_id: "lead-1",
  delivery_status: "failed",
  retryable: true,
  attempted_at: ago(10 * MIN),
  ...over,
});

describe("pickWebhookRetries", () => {
  it("retries a transient failure once its backoff has passed", () => {
    expect(pickWebhookRetries([row({ attempted_at: ago(2 * MIN) })], NOW)).toEqual([
      { organizationId: "org-a", leadId: "lead-1", attempts: 1 },
    ]);
  });

  it("waits out the backoff before the next attempt", () => {
    expect(pickWebhookRetries([row({ attempted_at: ago(30_000) })], NOW)).toEqual([]);
    const second = [row({ attempted_at: ago(2 * 3_600_000) }), row({ attempted_at: ago(3 * MIN) })];
    expect(pickWebhookRetries(second, NOW)).toEqual([]);
  });

  it("makes the inline attempt plus five scheduled retries, then stops", () => {
    const failures = (count: number) => Array.from({ length: count }, (_, i) => row({ attempted_at: ago((10 + i) * 3_600_000) }));
    expect(pickWebhookRetries(failures(5), NOW)).toHaveLength(1);
    expect(pickWebhookRetries(failures(WEBHOOK_RETRY_BACKOFF_MS.length + 1), NOW)).toEqual([]);
  });

  it("never retries a delivered lead, a non-retryable failure, or an old success-after-failure", () => {
    expect(pickWebhookRetries([row({ attempted_at: ago(2 * MIN) }), row({ delivery_status: "delivered", attempted_at: ago(MIN) })], NOW)).toEqual([]);
    expect(pickWebhookRetries([row({ retryable: false })], NOW)).toEqual([]);
    expect(pickWebhookRetries([row({ delivery_status: "skipped" })], NOW)).toEqual([]);
  });

  it("keeps workspaces separate even for the same lead id", () => {
    const rows = [
      row({ organization_id: "org-a", delivery_status: "delivered" }),
      row({ organization_id: "org-b", attempted_at: ago(2 * MIN) }),
    ];
    expect(pickWebhookRetries(rows, NOW)).toEqual([{ organizationId: "org-b", leadId: "lead-1", attempts: 1 }]);
  });
});
