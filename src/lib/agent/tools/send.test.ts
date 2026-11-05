import { describe, expect, it, vi } from "vitest";
import { createToolRegistryV2, type ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";
import { sendTools } from "./send";

const queue = vi.hoisted(() => ({
  requestReviewFor: vi.fn(async (..._args: unknown[]) => ({
    queued: 1,
    sent: 1,
    skipped: 0,
    failed: 0,
  })),
  queueAutomationEventFor: vi.fn(async (..._args: unknown[]) => ({
    queued: 2,
    sent: 0,
    skipped: 0,
    failed: 0,
  })),
}));
vi.mock("@/lib/automation-queue.server", () => queue);

const ORG = "11111111-1111-4111-8111-111111111111";
const APPT = "33333333-3333-4333-8333-333333333333";
const LEAD = "44444444-4444-4444-8444-444444444444";
const context = {
  supabase: {},
  userId: "u1",
  organizationId: ORG,
  isSuperAdmin: false,
} as unknown as ToolContextV2;
const deps = async () =>
  ({ admin: {}, deliverFor: () => async () => ({ delivered: true }) }) as never;

function registry(approve: (argsHash: string, tool: string) => boolean | undefined) {
  const consume = vi.fn(
    async (c: { tool: string; argsHash: string }) => approve(c.argsHash, c.tool) === true,
  );
  return {
    consume,
    registry: createToolRegistryV2(sendTools(deps), {
      audit: async () => {},
      approvals: { consume },
    }),
    noApprovals: createToolRegistryV2(sendTools(deps), { audit: async () => {} }),
  };
}

const calls = [
  { name: "reviews.request", arguments: { appointmentId: APPT, channel: "email" } },
  { name: "quotes.send", arguments: { leadId: LEAD } },
  { name: "bookings.reminder", arguments: { appointmentId: APPT } },
];

describe("PAI-12 send tools", () => {
  it("are all send_external, owner scope", () => {
    for (const tool of sendTools(deps))
      expect([tool.risk, tool.scope]).toEqual(["send_external", "owner"]);
    expect(sendTools(deps).map((t) => t.name)).toEqual([
      "reviews.request",
      "quotes.send",
      "bookings.reminder",
    ]);
  });

  it.each(calls)("$name queues nothing without an approval", async (call) => {
    queue.requestReviewFor.mockClear();
    queue.queueAutomationEventFor.mockClear();
    const { noApprovals } = registry(() => true);
    const res = await noApprovals.run(context, { ...call, requestId: "r1" });
    expect(res).toMatchObject({ ok: false, reason: "needs_approval" });
    expect(queue.requestReviewFor).not.toHaveBeenCalled();
    expect(queue.queueAutomationEventFor).not.toHaveBeenCalled();
  });

  it.each(calls)(
    "$name queues nothing when the owner has not approved these arguments",
    async (call) => {
      queue.requestReviewFor.mockClear();
      queue.queueAutomationEventFor.mockClear();
      const { registry: r } = registry(() => false);
      expect(await r.run(context, { ...call, requestId: "r2" })).toMatchObject({
        ok: false,
        reason: "needs_approval",
      });
      expect(queue.requestReviewFor).not.toHaveBeenCalled();
      expect(queue.queueAutomationEventFor).not.toHaveBeenCalled();
    },
  );

  it("runs the reviews path with the session workspace once approved, and returns counts only", async () => {
    queue.requestReviewFor.mockClear();
    const { registry: r } = registry(() => true);
    const res = await r.run(context, { ...calls[0]!, requestId: "r3" });
    expect(res).toMatchObject({ ok: true, data: { queued: 1, sent: 1, skipped: 0, failed: 0 } });
    expect(queue.requestReviewFor).toHaveBeenCalledTimes(1);
    expect(queue.requestReviewFor.mock.calls[0]![2]).toEqual({
      organizationId: ORG,
      appointmentId: APPT,
      channel: "email",
    });
  });

  it("maps quotes.send and bookings.reminder to the right triggers", async () => {
    queue.queueAutomationEventFor.mockClear();
    const { registry: r } = registry(() => true);
    await r.run(context, { ...calls[1]!, requestId: "r4" });
    await r.run(context, { ...calls[2]!, requestId: "r5" });
    const inputs = queue.queueAutomationEventFor.mock.calls.map((c) => c[2]);
    expect(inputs).toEqual([
      { organizationId: ORG, trigger: "quote_requested", leadId: LEAD, appointmentId: null },
      { organizationId: ORG, trigger: "booking_created", leadId: null, appointmentId: APPT },
    ]);
  });

  it("an approval is for exact arguments: a changed channel hashes differently, so it is not covered", async () => {
    const seen: string[] = [];
    const { registry: r } = registry((hash) => {
      seen.push(hash);
      return seen.length === 1;
    });
    queue.requestReviewFor.mockClear();
    await r.run(context, { ...calls[0]!, requestId: "r6" });
    const edited = await r.run(context, {
      name: "reviews.request",
      arguments: { appointmentId: APPT, channel: "sms" },
      requestId: "r7",
    });
    expect(new Set(seen).size).toBe(2);
    expect(edited).toMatchObject({ ok: false, reason: "needs_approval" });
    expect(queue.requestReviewFor).toHaveBeenCalledTimes(1);
  });

  it("refuses a workspace id in the arguments and unknown extra fields", async () => {
    const { registry: r } = registry(() => true);
    queue.requestReviewFor.mockClear();
    expect(
      await r.run(context, {
        name: "reviews.request",
        arguments: { appointmentId: APPT, channel: "email", organizationId: "x" },
        requestId: "r8",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(
      await r.run(context, {
        name: "quotes.send",
        arguments: { leadId: LEAD, message: "hi" },
        requestId: "r9",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(queue.requestReviewFor).not.toHaveBeenCalled();
  });

  it("rejects ids that aren't uuids", async () => {
    const { registry: r } = registry(() => true);
    expect(
      await r.run(context, {
        name: "bookings.reminder",
        arguments: { appointmentId: "not-an-id" },
        requestId: "r10",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });
  });
});
