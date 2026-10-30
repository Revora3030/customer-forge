/**
 * Founder approval queue for outside bots (table agent_action_requests).
 *
 * - createActionRequest: a bot asks for one Level 4 action. A retry with the
 *   same idempotency key returns the first request instead of a second one.
 * - decideActionRequest: the founder approves or rejects a pending, unexpired
 *   request. Only super-admins reach this (checked by the caller).
 * - readActionRequest: what the bot polls. "approved" is the only state in
 *   which the bot may act.
 * - completeActionRequest: the bot reports back, approved -> completed/failed.
 *
 * Nothing here performs the action itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTION_REQUEST_TTL_HOURS,
  MAX_PENDING_ACTION_REQUESTS,
  payloadLooksSecret,
  UUID,
  type ActionRequestInput,
  type ActionRequestRow,
  type ActionRequestView,
} from "@/lib/agent-gateway";
export type { ActionRequestRow, ActionRequestView, ActionRequestStatus } from "@/lib/agent-gateway";
import { LEVEL4_ACTIONS } from "@/lib/agent-authority";

type Db = Pick<SupabaseClient, "from">;
// The generated database types don't include this table until it is published.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (db: Db): any => (db as unknown as { from: (name: string) => unknown }).from("agent_action_requests");

const COLUMNS =
  "id, kind, title, detail, target_url, payload, evidence, requested_by, idempotency_key, status, created_at, expires_at, decided_at, decision_note, completed_at, result_url, result_note";

/** A pending request past its expiry reads "expired"; it can no longer be approved. */
export function viewOf(row: ActionRequestRow, now = Date.now()): ActionRequestView {
  const expired = row.status === "pending" && Date.parse(row.expires_at) <= now;
  return { ...row, state: expired ? "expired" : row.status, label: LEVEL4_ACTIONS[row.kind] ?? row.kind };
}

export class ActionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function createActionRequest(db: Db, input: ActionRequestInput, now = Date.now()): Promise<{ created: boolean; request: ActionRequestView }> {
  if (payloadLooksSecret(input.payload)) throw new ActionRequestError("payload must not contain credentials", 422);

  const existing = await table(db).select(COLUMNS).eq("requested_by", input.requested_by).eq("idempotency_key", input.idempotency_key).maybeSingle();
  if (existing.error) throw new ActionRequestError("Couldn't read the approval queue.", 503);
  if (existing.data) return { created: false, request: viewOf(existing.data as ActionRequestRow, now) };

  const pending = await table(db)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("expires_at", new Date(now).toISOString());
  if (pending.error || pending.count === null) throw new ActionRequestError("Couldn't read the approval queue.", 503);
  if (pending.count >= MAX_PENDING_ACTION_REQUESTS)
    throw new ActionRequestError(`The founder already has ${MAX_PENDING_ACTION_REQUESTS} requests waiting. Wait for decisions first.`, 429);

  const inserted = await table(db)
    .insert({
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      target_url: input.target_url ?? null,
      payload: input.payload ?? {},
      evidence: input.evidence ?? null,
      requested_by: input.requested_by,
      idempotency_key: input.idempotency_key,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + ACTION_REQUEST_TTL_HOURS * 3_600_000).toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (inserted.error) {
    // Two retries raced: the unique key kept one, so return that one.
    if ((inserted.error as { code?: string }).code === "23505") {
      const again = await table(db).select(COLUMNS).eq("requested_by", input.requested_by).eq("idempotency_key", input.idempotency_key).maybeSingle();
      if (again.data) return { created: false, request: viewOf(again.data as ActionRequestRow, now) };
    }
    throw new ActionRequestError("Couldn't save the request.", 503);
  }
  return { created: true, request: viewOf(inserted.data as ActionRequestRow, now) };
}

export async function readActionRequest(db: Db, id: string, now = Date.now()): Promise<ActionRequestView | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await table(db).select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new ActionRequestError("Couldn't read the approval queue.", 503);
  return data ? viewOf(data as ActionRequestRow, now) : null;
}

export async function listActionRequests(db: Db, now = Date.now(), limit = 60): Promise<ActionRequestView[]> {
  const { data, error } = await table(db).select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    // A missing or unreadable queue is reported as unavailable, never as an empty inbox:
    // "nothing waiting" is a claim about the founder's work, not about the database.
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205")
      throw new ActionRequestError("The approval queue isn't available yet — it goes live with the next publish.", 503);
    throw new ActionRequestError("Couldn't load the approval queue.", 503);
  }
  const rows = ((data ?? []) as ActionRequestRow[]).map((row) => viewOf(row, now));
  const waiting = (row: ActionRequestView) => (row.state === "pending" ? 0 : 1);
  return rows.sort((a, b) => waiting(a) - waiting(b));
}

/** The founder's decision. Only a pending, unexpired request changes. */
export async function decideActionRequest(
  db: Db,
  input: { id: string; approve: boolean; userId: string; note?: string | null | undefined },
  now = Date.now(),
): Promise<ActionRequestView> {
  if (!UUID.test(input.id)) throw new ActionRequestError("That request isn't valid.", 400);
  const nowIso = new Date(now).toISOString();
  const { data, error } = await table(db)
    .update({
      status: input.approve ? "approved" : "rejected",
      decided_at: nowIso,
      decided_by: input.userId,
      decision_note: input.note?.trim().slice(0, 500) || null,
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .select(COLUMNS);
  if (error) throw new ActionRequestError("Couldn't save the decision.", 503);
  if (data?.length) return viewOf(data[0] as ActionRequestRow, now);
  const current = await readActionRequest(db, input.id, now);
  if (!current) throw new ActionRequestError("That request was not found.", 404);
  if (current.state === "expired") throw new ActionRequestError("That request expired. Ask the bot to send it again.", 409);
  throw new ActionRequestError(`That request was already ${current.state}.`, 409);
}

/** The bot reports what happened after an approved action. */
export async function completeActionRequest(
  db: Db,
  input: { id: string; ok: boolean; resultUrl?: string | undefined; note?: string | undefined },
  now = Date.now(),
): Promise<ActionRequestView> {
  if (!UUID.test(input.id)) throw new ActionRequestError("That request isn't valid.", 400);
  const { data, error } = await table(db)
    .update({
      status: input.ok ? "completed" : "failed",
      completed_at: new Date(now).toISOString(),
      result_url: input.resultUrl && /^https:\/\//.test(input.resultUrl) ? input.resultUrl.slice(0, 500) : null,
      result_note: input.note?.slice(0, 1000) ?? null,
    })
    .eq("id", input.id)
    .eq("status", "approved")
    .select(COLUMNS);
  if (error) throw new ActionRequestError("Couldn't save the result.", 503);
  if (data?.length) return viewOf(data[0] as ActionRequestRow, now);
  const current = await readActionRequest(db, input.id, now);
  if (!current) throw new ActionRequestError("That request was not found.", 404);
  throw new ActionRequestError(`Only an approved request can be completed; this one is ${current.state}.`, 409);
}

/** Counts for the health check and briefing. null when it can't be read. */
export async function pendingActionRequestCount(db: Db, now = Date.now()): Promise<number | null> {
  const { count, error } = await table(db)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("expires_at", new Date(now).toISOString());
  // No number and no error still means the queue could not be read.
  return error || count === null ? null : count;
}

/** The bot-facing shape: no evidence echo, just the decision and links. */
export function botView(request: ActionRequestView, origin: string) {
  return {
    id: request.id,
    kind: request.kind,
    title: request.title,
    state: request.state,
    mayExecute: request.state === "approved",
    decidedAt: request.decided_at,
    decisionNote: request.decision_note,
    expiresAt: request.expires_at,
    completedAt: request.completed_at,
    resultUrl: request.result_url,
    approvalUrl: `${origin}/admin/approvals?request=${request.id}`,
  };
}
