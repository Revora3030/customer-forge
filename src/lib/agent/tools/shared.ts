/**
 * Shared helpers for the agent's read tools (PAI-7/PAI-8 style).
 *
 * Every read tool runs through the caller's own request-scoped client (row
 * level security applies) and is pinned to the session workspace; the model
 * never supplies a workspace id. Outputs are bounded so a tool result can't
 * flood the model context: at most MAX_ROWS rows and about MAX_BYTES of JSON.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";

export const MAX_ROWS = 50;
export const MAX_BYTES = 8 * 1024;

export type Db = SupabaseClient<Database>;

export function db(context: ToolContextV2): Db {
  return context.supabase as unknown as Db;
}

/** Caps a list and trims it further until the whole payload fits MAX_BYTES. */
export function bounded<T extends Record<string, unknown>>(
  payload: T,
  listKey: keyof T,
): T & { truncated: boolean; total: number } {
  const list = (payload[listKey] as unknown[]) ?? [];
  const total = list.length;
  let rows = list.slice(0, MAX_ROWS);
  const build = () => ({ ...payload, [listKey]: rows, total, truncated: rows.length < total });
  while (rows.length > 0 && JSON.stringify(build()).length > MAX_BYTES)
    rows = rows.slice(0, Math.max(0, Math.floor(rows.length * 0.75)));
  return build() as T & { truncated: boolean; total: number };
}

export function readFailed(error: unknown): never {
  void error;
  throw new Error("You don't have access to that workspace, or the data couldn't be read.");
}
