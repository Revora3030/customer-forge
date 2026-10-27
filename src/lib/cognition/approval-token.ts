/**
 * Pillar 3 (Hands): dual-key execution. A consequential action is proposed,
 * the owner approves that exact payload, and the approval is a single-use,
 * expiring token bound to the payload hash and the approving actor. Executing
 * anything else, anything later, or anything twice is refused. The store is
 * injected; a database-backed one is a separate, owner-approved migration.
 */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export type ApprovalRecord = {
  id: string;
  action: string;
  payloadHash: string;
  approvedBy: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export interface ApprovalStore {
  save(record: ApprovalRecord): Promise<void>;
  get(id: string): Promise<ApprovalRecord | null>;
  /** Atomic: marks consumed only if it is still unconsumed. Returns false when someone else got there first. */
  consume(id: string, at: number): Promise<boolean>;
}

export async function hashPayload(payload: unknown): Promise<string> {
  const text = JSON.stringify(payload, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueApproval(store: ApprovalStore, input: { action: string; payload: unknown; approvedBy: string; now?: number; ttlMs?: number }): Promise<ApprovalRecord> {
  const now = input.now ?? Date.now();
  const record: ApprovalRecord = {
    id: crypto.randomUUID(),
    action: input.action,
    payloadHash: await hashPayload(input.payload),
    approvedBy: input.approvedBy,
    issuedAt: now,
    expiresAt: now + Math.min(input.ttlMs ?? APPROVAL_TTL_MS, APPROVAL_TTL_MS),
    consumedAt: null,
  };
  await store.save(record);
  return record;
}

export type ApprovalCheck = { ok: true; record: ApprovalRecord } | { ok: false; reason: "not_found" | "expired" | "already_used" | "action_mismatch" | "payload_changed" };

/** Verifies and consumes in one step; any mismatch leaves the token unspent. */
export async function consumeApproval(store: ApprovalStore, input: { id: string; action: string; payload: unknown; now?: number }): Promise<ApprovalCheck> {
  const now = input.now ?? Date.now();
  const record = await store.get(input.id);
  if (!record) return { ok: false, reason: "not_found" };
  if (record.consumedAt !== null) return { ok: false, reason: "already_used" };
  if (now >= record.expiresAt) return { ok: false, reason: "expired" };
  if (record.action !== input.action) return { ok: false, reason: "action_mismatch" };
  if (record.payloadHash !== (await hashPayload(input.payload))) return { ok: false, reason: "payload_changed" };
  if (!(await store.consume(record.id, now))) return { ok: false, reason: "already_used" };
  return { ok: true, record: { ...record, consumedAt: now } };
}

export function memoryApprovalStore(): ApprovalStore {
  const rows = new Map<string, ApprovalRecord>();
  return {
    async save(record) { rows.set(record.id, { ...record }); },
    async get(id) { const row = rows.get(id); return row ? { ...row } : null; },
    async consume(id, at) {
      const row = rows.get(id);
      if (!row || row.consumedAt !== null) return false;
      row.consumedAt = at;
      return true;
    },
  };
}
