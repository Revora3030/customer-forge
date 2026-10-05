/**
 * Saved builder conversation. Each business keeps its chat with the AI team,
 * so an owner can close the builder and carry on later where they left off.
 * Access is limited by the table's access rules to members of that business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { MAIN_BRANCH, kindForTurn, normaliseBranch, normaliseRequestId, type MessageKind } from "@/lib/builder/chat-thread";

export type SavedTaskResult = {
  state: "complete" | "failed" | "skipped";
  applied?: number;
  failedCount?: number;
  staleCount?: number;
  snapshotVersion?: number;
  notice?: string;
};

export type SavedTurn = {
  role: "user" | "assistant";
  content: string;
  at: string;
  taskResult?: SavedTaskResult;
  /** The request this turn belongs to (same id the server uses for idempotency). */
  requestId?: string | null;
  kind?: MessageKind;
  /** Conversation branch; "main" unless the owner explored an alternate direction. */
  branch?: string;
};

/** How many earlier turns are brought back when the builder opens. */
export const MEMORY_TURNS = 40;

export function toTurns(
  rows: Array<{
    role: string;
    content: string;
    created_at: string;
    plan?: unknown;
    request_id?: string | null;
    kind?: string | null;
    branch?: string | null;
  }>,
): SavedTurn[] {
  return [...rows]
    // Same moment: a request always comes before its reply.
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.role === "user" ? -1 : b.role === "user" ? 1 : 0))
    .filter((row) => (row.role === "user" || row.role === "assistant") && row.content.trim())
    .map((row) => ({
      role: row.role as SavedTurn["role"],
      content: row.content,
      at: row.created_at,
      ...(isSavedTaskResult(row.plan) ? { taskResult: row.plan } : {}),
      requestId: row.request_id ?? null,
      kind: kindForTurn({
        role: row.role as SavedTurn["role"],
        kind: row.kind,
        taskResult: isSavedTaskResult(row.plan) ? row.plan : null,
      }),
      branch: row.branch || MAIN_BRANCH,
    }));
}

/** Pairs saved turns back into finished chat entries: each request with its reply. */
export function pairTurns(turns: SavedTurn[]): Array<{ instruction: string; reply: string; at: string; taskResult?: SavedTaskResult }> {
  const pairs: Array<{ instruction: string; reply: string; at: string; taskResult?: SavedTaskResult }> = [];
  for (const turn of turns) {
    if (turn.role === "user") pairs.push({ instruction: turn.content, reply: "", at: turn.at });
    else if (pairs.length) {
      const pair = pairs[pairs.length - 1];
      if (!pair) continue;
      pair.reply = pair.reply ? `${pair.reply}\n\n${turn.content}` : turn.content;
      if (turn.taskResult) pair.taskResult = turn.taskResult;
    }
  }
  return pairs;
}

export async function loadTurns(organizationId: string): Promise<SavedTurn[]> {
  // request_id/kind/branch were added by migration 20261005140000; read them
  // through an untyped view until the generated types are refreshed.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from("builder_messages")
    .select("role, content, created_at, plan, request_id, kind, branch")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MEMORY_TURNS);
  if (error) throw error;
  return toTurns([...(data ?? [])].reverse());
}

export async function saveTurns(organizationId: string, turns: Array<Omit<SavedTurn, "at">>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !turns.length) return;
  // Turns saved together get distinct times so they always read back in order.
  const base = Date.now();
  const { error } = await supabase.from("builder_messages").insert(
    turns.map((turn, index) => ({
      created_at: new Date(base + index).toISOString(),
      organization_id: organizationId,
      user_id: auth.user!.id,
      role: turn.role,
      content: turn.content.slice(0, 20000),
      plan: (turn.taskResult ?? null) as Json,
      request_id: normaliseRequestId(turn.requestId),
      kind: kindForTurn(turn),
      branch: normaliseBranch(turn.branch ?? MAIN_BRANCH),
    })) as never,
  );
  if (error) throw error;
}

function isSavedTaskResult(value: unknown): value is SavedTaskResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "complete" || state === "failed" || state === "skipped";
}

export async function clearTurns(organizationId: string): Promise<void> {
  const { error } = await supabase.from("builder_messages").delete().eq("organization_id", organizationId);
  if (error) throw error;
}
