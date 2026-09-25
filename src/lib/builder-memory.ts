/**
 * Saved builder conversation. Each business keeps its chat with the AI team,
 * so an owner can close the builder and carry on later where they left off.
 * Access is limited by the table's access rules to members of that business.
 */
import { supabase } from "@/integrations/supabase/client";

export type SavedTurn = { role: "user" | "assistant"; content: string; at: string };

/** How many earlier turns are brought back when the builder opens. */
export const MEMORY_TURNS = 40;

export function toTurns(rows: Array<{ role: string; content: string; created_at: string }>): SavedTurn[] {
  return rows
    .filter((row) => (row.role === "user" || row.role === "assistant") && row.content.trim())
    .map((row) => ({ role: row.role as SavedTurn["role"], content: row.content, at: row.created_at }));
}

/** Pairs saved turns back into finished chat entries: each request with its reply. */
export function pairTurns(turns: SavedTurn[]): Array<{ instruction: string; reply: string; at: string }> {
  const pairs: Array<{ instruction: string; reply: string; at: string }> = [];
  for (const turn of turns) {
    if (turn.role === "user") pairs.push({ instruction: turn.content, reply: "", at: turn.at });
    else if (pairs.length && !pairs[pairs.length - 1]!.reply) pairs[pairs.length - 1]!.reply = turn.content;
  }
  return pairs;
}

export async function loadTurns(organizationId: string): Promise<SavedTurn[]> {
  const { data, error } = await supabase
    .from("builder_messages")
    .select("role, content, created_at")
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
    })),
  );
  if (error) throw error;
}

export async function clearTurns(organizationId: string): Promise<void> {
  const { error } = await supabase.from("builder_messages").delete().eq("organization_id", organizationId);
  if (error) throw error;
}
