/**
 * Durable, single-use approvals for Jarvis proposals (table jarvis_approvals).
 *
 * - recordProposals: when a reply is saved, one pending row per proposal, keyed
 *   "<message id>:<index>" with a SHA-256 of exactly what Jarvis proposed.
 * - claimApproval: before an approved action runs, atomically flips the row
 *   pending/failed -> claimed, only when it is unexpired and the arguments the
 *   browser sends still hash to the proposal saved in the reply. So a proposal
 *   runs at most once at a time, only as proposed, and never after 24 hours.
 * - finishApproval: claimed -> done (with an optional https result link) or
 *   failed (which the owner may retry while unexpired).
 * - rejectApproval / listApprovals: the unified approvals list.
 *
 * Replies saved before this table existed have no row; claiming one checks the
 * proposal against the saved reply itself and records the claim then.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { splitReplyMeta, type WriteProposal } from "@/lib/jarvis-actions";

type Db = Pick<SupabaseClient, "from">;

export const APPROVAL_TTL_MS = 24 * 3_600_000;
export const STALE_CLAIM_MS = 30 * 60_000;
export const APPROVAL_KEY = /^([0-9a-f-]{36}):([0-4])$/i;

export type ApprovalStatus = "pending" | "claimed" | "done" | "failed" | "rejected";
export type ApprovalRow = {
  id: string;
  approval_key: string;
  action_id: string;
  summary: string;
  status: ApprovalStatus;
  conversation_id: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  finished_at: string | null;
  result_url: string | null;
};
export type ClaimResult = { ok: true } | { ok: false; reason: "invalid" | "not_found" | "changed" | "expired" | "used" | "rejected" | "busy"; message: string };

/** JSON with sorted keys and no undefined values, so equal proposals hash equally. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : stableJson(item))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

export async function proposalHash(proposal: unknown): Promise<string> {
  // Round-trip through JSON first: that is the shape both the reply and the browser hold.
  const normal = JSON.parse(JSON.stringify(proposal ?? null)) as unknown;
  const bytes = new TextEncoder().encode(stableJson(normal));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A short plain-text line for the approvals list. Never includes secrets; proposals hold none. */
export function summaryFor(proposal: WriteProposal): string {
  const p = proposal as Record<string, unknown> & { id: string };
  const pick = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
  const input = (p["input"] ?? {}) as Record<string, unknown>;
  const pr = (p["pr"] ?? {}) as Record<string, unknown>;
  const routine = (p["routine"] ?? {}) as Record<string, unknown>;
  const detail = pick(input["businessName"], pr["title"], p["question"], p["request"], p["prompt"], routine["name"], p["note"]);
  const line = detail ? `${p.id}: ${detail}` : p.id;
  return line.replace(/\s+/g, " ").slice(0, 300);
}

/** One pending row per proposal in a saved reply. Best-effort: never blocks the reply. */
export async function recordProposals(db: Db, userId: string, messageId: string | null, conversationId: string | null, content: string, now = Date.now()): Promise<number> {
  if (!messageId) return 0;
  try {
    const { proposals } = splitReplyMeta(content).meta;
    if (!proposals.length) return 0;
    const rows = await Promise.all(proposals.map(async (proposal, index) => ({
      user_id: userId,
      message_id: messageId,
      conversation_id: conversationId,
      approval_key: `${messageId}:${index}`,
      action_id: proposal.id,
      summary: summaryFor(proposal),
      args_hash: await proposalHash(proposal),
      expires_at: new Date(now + APPROVAL_TTL_MS).toISOString(),
    })));
    const { error } = await (db.from("jarvis_approvals") as unknown as { upsert: (rows: unknown, options: unknown) => Promise<{ error: unknown }> })
      .upsert(rows, { onConflict: "user_id,approval_key", ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/** The proposal at `index` in the owner's saved reply, or null. */
async function savedProposal(db: Db, userId: string, messageId: string, index: number): Promise<{ proposal: WriteProposal; createdAt: string; conversationId: string | null } | null> {
  const { data, error } = await db
    .from("jarvis_messages")
    .select("content, created_at, conversation_id, role")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || data.role !== "assistant") return null;
  const proposal = splitReplyMeta(String(data.content ?? "")).meta.proposals[index];
  return proposal ? { proposal, createdAt: String(data.created_at), conversationId: (data.conversation_id as string | null) ?? null } : null;
}

const REFUSALS: Record<Exclude<ClaimResult, { ok: true }>["reason"], string> = {
  invalid: "That approval isn't valid.",
  not_found: "That proposal was not found. Ask Jarvis again.",
  changed: "That proposal changed after Jarvis made it. Ask Jarvis again.",
  expired: "That proposal expired (approvals last 24 hours). Ask Jarvis again.",
  used: "That proposal was already approved.",
  rejected: "That proposal was dismissed. Ask Jarvis again.",
  busy: "That proposal is already running.",
};
const refuse = (reason: Exclude<ClaimResult, { ok: true }>["reason"]): ClaimResult => ({ ok: false, reason, message: REFUSALS[reason] });

/** Postgres "undefined table" or PostgREST "table not in schema cache". */
export function tableMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

export async function claimApproval(db: Db, userId: string, key: string, proposal: unknown, now = Date.now()): Promise<ClaimResult> {
  const match = APPROVAL_KEY.exec(key);
  if (!match) return refuse("invalid");
  const hash = await proposalHash(proposal);
  const nowIso = new Date(now).toISOString();
  const claimed = await db
    .from("jarvis_approvals")
    .update({ status: "claimed", decided_at: nowIso })
    .eq("user_id", userId)
    .eq("approval_key", key)
    .eq("args_hash", hash)
    .in("status", ["pending", "failed"])
    .gt("expires_at", nowIso)
    .select("id");
  // Before the migration is published the table doesn't exist yet: keep the old
  // browser-only behaviour rather than blocking every approval.
  if (claimed.error) return tableMissing(claimed.error) ? { ok: true } : refuse("busy");
  if (claimed.data?.length) return { ok: true };
  // A claim whose tab closed mid-run never reported back: free it after 30 minutes.
  const stale = await db
    .from("jarvis_approvals")
    .update({ status: "claimed", decided_at: nowIso })
    .eq("user_id", userId)
    .eq("approval_key", key)
    .eq("args_hash", hash)
    .eq("status", "claimed")
    .lt("decided_at", new Date(now - STALE_CLAIM_MS).toISOString())
    .gt("expires_at", nowIso)
    .select("id");
  if (stale.data?.length) return { ok: true };

  const existing = await db.from("jarvis_approvals").select("status, args_hash, expires_at").eq("user_id", userId).eq("approval_key", key).maybeSingle();
  if (existing.data) {
    const row = existing.data as { status: ApprovalStatus; args_hash: string; expires_at: string };
    if (row.args_hash !== hash) return refuse("changed");
    if (row.status === "done") return refuse("used");
    if (row.status === "claimed") return refuse("busy");
    if (row.status === "rejected") return refuse("rejected");
    return refuse("expired");
  }

  // A reply saved before approvals were recorded: check the proposal against the reply itself.
  const saved = await savedProposal(db, userId, match[1]!, Number(match[2]));
  if (!saved) return refuse("not_found");
  if ((await proposalHash(saved.proposal)) !== hash) return refuse("changed");
  if (now - Date.parse(saved.createdAt) > APPROVAL_TTL_MS) return refuse("expired");
  const inserted = await db.from("jarvis_approvals").insert({
    user_id: userId,
    message_id: match[1],
    conversation_id: saved.conversationId,
    approval_key: key,
    action_id: saved.proposal.id,
    summary: summaryFor(saved.proposal),
    args_hash: hash,
    status: "claimed",
    decided_at: nowIso,
    expires_at: new Date(Date.parse(saved.createdAt) + APPROVAL_TTL_MS).toISOString(),
  });
  // A unique-key conflict means another tab claimed it first.
  return inserted.error ? refuse("busy") : { ok: true };
}

export async function finishApproval(db: Db, userId: string, key: string, ok: boolean, url?: string | null, now = Date.now()): Promise<void> {
  if (!APPROVAL_KEY.test(key)) return;
  const resultUrl = ok && typeof url === "string" && /^https:\/\//.test(url) ? url.slice(0, 500) : null;
  await db
    .from("jarvis_approvals")
    .update({ status: ok ? "done" : "failed", finished_at: new Date(now).toISOString(), ...(resultUrl ? { result_url: resultUrl } : {}) })
    .eq("user_id", userId)
    .eq("approval_key", key)
    .eq("status", "claimed");
}

export async function rejectApproval(db: Db, userId: string, key: string, now = Date.now()): Promise<boolean> {
  if (!APPROVAL_KEY.test(key)) return false;
  const { data } = await db
    .from("jarvis_approvals")
    .update({ status: "rejected", decided_at: new Date(now).toISOString() })
    .eq("user_id", userId)
    .eq("approval_key", key)
    .in("status", ["pending", "failed"])
    .select("id");
  return Boolean(data?.length);
}

export type ApprovalListItem = ApprovalRow & { state: ApprovalStatus | "expired" };

/** Newest first, waiting ones on top; a pending row past its expiry reads "expired". */
export async function listApprovals(db: Db, userId: string, now = Date.now(), limit = 60): Promise<ApprovalListItem[]> {
  const { data, error } = await db
    .from("jarvis_approvals")
    .select("id, approval_key, action_id, summary, status, conversation_id, created_at, expires_at, decided_at, finished_at, result_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error)) return [];
    throw new Error("Couldn't load approvals.");
  }
  const items = ((data ?? []) as ApprovalRow[]).map((row) => ({
    ...row,
    state: (row.status === "pending" || row.status === "failed") && Date.parse(row.expires_at) <= now ? ("expired" as const) : row.status,
  }));
  const waiting = (item: ApprovalListItem) => (item.state === "pending" || item.state === "failed" ? 0 : 1);
  return items.sort((a, b) => waiting(a) - waiting(b));
}
