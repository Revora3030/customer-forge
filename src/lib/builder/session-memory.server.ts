/**
 * Long-session memory, stored per workspace.
 *
 * Reads and writes run through the caller's own client, so RLS keeps one
 * workspace's memory out of another's. Nothing here may ever block or slow a
 * build: recall failures return an empty memory and recording failures are
 * logged and swallowed.
 */

import {
  extractMemories,
  memoryBrief,
  newMemories,
  pruneMemories,
  type MemoryEntry,
} from "@/lib/builder/session-memory";

type MemoryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert: (rows: unknown) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (column: string, values: string[]) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

type Row = {
  id: string;
  kind: MemoryEntry["kind"];
  text: string;
  pinned: boolean;
  created_at: string;
};

/** Everything remembered for one website, newest first. Never throws. */
export async function loadMemory(
  client: MemoryClient,
  organizationId: string,
): Promise<MemoryEntry[]> {
  try {
    const { data, error } = await client
      .from("website_memory")
      .select("id, kind, text, pinned, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return (data as Row[]).map((row) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
      pinned: row.pinned === true,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/** The recall brief for the planner, or null when there is nothing to recall. */
export async function recallBrief(
  client: MemoryClient,
  organizationId: string,
): Promise<string | null> {
  return memoryBrief(await loadMemory(client, organizationId));
}

/**
 * Records one completed exchange: the owner's standing rules and request, what
 * was actually applied, and anything that did not work. Older ordinary entries
 * beyond the limit are forgotten; standing rules and pinned entries are kept.
 */
export async function rememberExchange(
  client: MemoryClient,
  organizationId: string,
  userId: string | null,
  exchange: { instruction: string; summary?: string | null; applied?: string[]; failed?: string[] },
): Promise<{ added: number; forgotten: number }> {
  try {
    const existing = await loadMemory(client, organizationId);
    const fresh = newMemories(existing, extractMemories(exchange));
    if (fresh.length) {
      const { error } = await client.from("website_memory").insert(
        fresh.map((entry) => ({
          organization_id: organizationId,
          kind: entry.kind,
          text: entry.text,
          ...(userId ? { created_by: userId } : {}),
        })),
      );
      if (error) console.warn("[memory] not recorded", error.message);
    }

    const { drop } = pruneMemories([
      ...fresh.map((entry) => ({ ...entry, createdAt: new Date().toISOString() })),
      ...existing,
    ]);
    const removable = drop.map((entry) => entry.id).filter((id): id is string => Boolean(id));
    if (removable.length) {
      const { error } = await client
        .from("website_memory")
        .delete()
        .eq("organization_id", organizationId)
        .in("id", removable);
      if (error) console.warn("[memory] not pruned", error.message);
    }
    return { added: fresh.length, forgotten: removable.length };
  } catch (error) {
    console.warn("[memory] exchange not recorded", error);
    return { added: 0, forgotten: 0 };
  }
}
