/**
 * Saved builder conversation. Each business keeps its chat with the AI team,
 * so an owner can close the builder and carry on later where they left off.
 * Access is limited by the table's access rules to members of that business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { MAIN_BRANCH, kindForTurn, normaliseBranch, normaliseRequestId, type MessageKind } from "@/lib/builder/chat-thread";
import { normaliseSavedTaskResult, isChatAuthorizationError } from "@/lib/builder-chat-result";
import { pairTurns as pairSavedTurns } from "@/lib/builder-message-pairing";
import { clearCachedTurns, readCachedTurns, writeCachedTurns } from "@/lib/builder-chat-cache";
export { clearAllCachedTurns, clearCachedTurns, readCachedTurns, writeCachedTurns } from "@/lib/builder-chat-cache";

export type SavedTaskResult = {
  state: "complete" | "failed" | "skipped";
  applied?: number;
  failedCount?: number;
  staleCount?: number;
  snapshotVersion?: number;
  notice?: string;
  error?: string;
  retryable?: boolean;
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
    .map((row) => {
      const result = normaliseSavedTaskResult(row.plan, row.content);
      return {
        role: row.role as SavedTurn["role"],
        content: row.content,
        at: row.created_at,
        ...(result ? { taskResult: result } : {}),
        requestId: normaliseRequestId(row.request_id),
        kind: kindForTurn({ role: row.role as SavedTurn["role"], kind: row.kind, taskResult: result }),
        branch: normaliseBranch(row.branch),
      };
    });
}

/** Pairs saved turns back into finished chat entries: each request with its reply. */
export function pairTurns(turns: SavedTurn[]): Array<{ instruction: string; reply: string; at: string; taskResult?: SavedTaskResult }> {
  return pairSavedTurns(turns);
}

/** Columns every deployed builder_messages table has. */
const CORE_COLUMNS = "role, content, created_at, plan";
/** Columns added by migration 20261005140000 (may be missing where it has not been applied). */
const THREAD_COLUMNS = "request_id, kind, branch";

/** Missing thread columns must not prevent core chat from loading and saving. */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42703" || code === "PGRST204") return true;
  return typeof message === "string" && /column .* does not exist|could not find the '.*' column/i.test(message);
}

/** Database turns win; cached turns newer than the newest saved one are kept (unsaved in-flight turns). */
export function mergeTurns(saved: SavedTurn[], cached: SavedTurn[]): SavedTurn[] {
  if (!cached.length) return saved;
  if (!saved.length) return cached;
  const newest = saved[saved.length - 1]!.at;
  const seen = new Set(saved.map((turn) => `${turn.role}|${turn.content}`));
  const extra = cached.filter((turn) => turn.at > newest && !seen.has(`${turn.role}|${turn.content}`));
  return [...saved, ...extra];
}

type MessageRow = Parameters<typeof toTurns>[0][number];
async function selectRows(organizationId: string, columns: string) {
  return (supabase as unknown as SupabaseClient)
    .from("builder_messages")
    .select(columns)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MEMORY_TURNS);
}

export async function loadTurns(organizationId: string): Promise<SavedTurn[]> {
  const cached = readCachedTurns(organizationId);
  let result = await selectRows(organizationId, `${CORE_COLUMNS}, ${THREAD_COLUMNS}`);
  if (result.error && isMissingColumnError(result.error)) {
    console.warn("[builder-memory] thread columns missing; loading core chat columns only", result.error.message);
    result = await selectRows(organizationId, CORE_COLUMNS);
  }
  if (result.error) {
    if (isChatAuthorizationError(result.error, result.status)) {
      clearCachedTurns(organizationId);
      throw result.error;
    }
    // A network failure may retain display-only cache, but never an authorization rejection.
    if (cached.length) return cached;
    throw result.error;
  }
  const saved = toTurns([...((result.data ?? []) as unknown as MessageRow[])].reverse());
  const merged = mergeTurns(saved, cached);
  writeCachedTurns(organizationId, merged);
  return merged;
}

export async function saveTurns(organizationId: string, turns: Array<Omit<SavedTurn, "at">>): Promise<void> {
  if (!turns.length) return;
  const base = Date.now();
  const stamped = turns.map((turn, index) => ({ ...turn, at: new Date(base + index).toISOString() }));
  writeCachedTurns(organizationId, [...readCachedTurns(organizationId), ...stamped]);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const core = stamped.map((turn) => ({
    created_at: turn.at, organization_id: organizationId, user_id: auth.user!.id,
    role: turn.role, content: turn.content.slice(0, 20000), plan: (turn.taskResult ?? null) as Json,
  }));
  const full = stamped.map((turn, index) => ({
    ...core[index]!, request_id: normaliseRequestId(turn.requestId), kind: kindForTurn(turn), branch: normaliseBranch(turn.branch ?? MAIN_BRANCH),
  }));
  const { error } = await supabase.from("builder_messages").insert(full as never);
  if (!error) return;
  if (!isMissingColumnError(error)) throw error;
  console.warn("[builder-memory] thread columns missing; saving core chat columns only", error.message);
  const retry = await supabase.from("builder_messages").insert(core as never);
  if (retry.error) throw retry.error;
}

export async function clearTurns(organizationId: string): Promise<void> {
  clearCachedTurns(organizationId);
  const { error } = await supabase.from("builder_messages").delete().eq("organization_id", organizationId);
  if (error) throw error;
}
