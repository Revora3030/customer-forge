import { describe, expect, it } from "vitest";
import { APPROVAL_TTL_MS, consumeApproval, hashPayload, issueApproval, memoryApprovalStore } from "./approval-token";

const NOW = 1_800_000_000_000;
const payload = { leadId: "l1", stage: "Quoted" };

describe("approval tokens", () => {
  it("approves the exact payload once", async () => {
    const store = memoryApprovalStore();
    const token = await issueApproval(store, { action: "lead.update_stage", payload, approvedBy: "owner", now: NOW });
    const first = await consumeApproval(store, { id: token.id, action: "lead.update_stage", payload: { stage: "Quoted", leadId: "l1" }, now: NOW + 1000 });
    expect(first.ok).toBe(true);
    expect(await consumeApproval(store, { id: token.id, action: "lead.update_stage", payload, now: NOW + 2000 })).toEqual({ ok: false, reason: "already_used" });
  });

  it("refuses a changed payload or a different action and leaves the token unspent", async () => {
    const store = memoryApprovalStore();
    const token = await issueApproval(store, { action: "lead.update_stage", payload, approvedBy: "owner", now: NOW });
    expect(await consumeApproval(store, { id: token.id, action: "lead.update_stage", payload: { ...payload, stage: "Won" }, now: NOW })).toEqual({ ok: false, reason: "payload_changed" });
    expect(await consumeApproval(store, { id: token.id, action: "webhook.dispatch", payload, now: NOW })).toEqual({ ok: false, reason: "action_mismatch" });
    expect((await consumeApproval(store, { id: token.id, action: "lead.update_stage", payload, now: NOW })).ok).toBe(true);
  });

  it("expires after 24 hours at most, even if a longer ttl is requested", async () => {
    const store = memoryApprovalStore();
    const token = await issueApproval(store, { action: "a", payload, approvedBy: "owner", now: NOW, ttlMs: 10 * APPROVAL_TTL_MS });
    expect(token.expiresAt - token.issuedAt).toBe(APPROVAL_TTL_MS);
    expect(await consumeApproval(store, { id: token.id, action: "a", payload, now: NOW + APPROVAL_TTL_MS })).toEqual({ ok: false, reason: "expired" });
  });

  it("reports unknown tokens and lets only one of two racing consumers win", async () => {
    const store = memoryApprovalStore();
    expect(await consumeApproval(store, { id: "nope", action: "a", payload, now: NOW })).toEqual({ ok: false, reason: "not_found" });
    const token = await issueApproval(store, { action: "a", payload, approvedBy: "owner", now: NOW });
    const results = await Promise.all([1, 2].map(() => consumeApproval(store, { id: token.id, action: "a", payload, now: NOW })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("hashes payloads independent of key order", async () => {
    expect(await hashPayload({ a: 1, b: { c: 2, d: 3 } })).toBe(await hashPayload({ b: { d: 3, c: 2 }, a: 1 }));
    expect(await hashPayload({ a: 1 })).not.toBe(await hashPayload({ a: 2 }));
  });
});
