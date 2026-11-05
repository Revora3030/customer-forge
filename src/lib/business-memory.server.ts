/**
 * Business memory store (PAI-6), server side.
 *
 * Every function takes the workspace as `ctx.organizationId`, which the caller
 * fills from the signed-in session. Nothing here accepts a workspace from the
 * model, and every query filters on it, on top of the row-level security that
 * the caller's own client already runs under. Embedding writes and the recall
 * RPC need the service role, so they take a separate `admin` client that is
 * only ever used after the caller's own client has read the row.
 *
 * Rules (see business-memory.ts and 20261105070000_business_memory.sql):
 *  - a fact needs a source; the assistant's own guesses start as `proposed`
 *    and only a signed-in owner can confirm them;
 *  - editing writes a history event with old and new values and who did it;
 *  - delete is soft; history is kept;
 *  - vectors and recall never fail a request: without embeddings recall falls
 *    back to word overlap.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkNewMemory,
  initialStatus,
  memoryEmbeddingText,
  toRecalled,
  type BusinessMemoryRow,
  type MemoryActor,
  type MemoryKind,
  type NewMemoryInput,
  type RecalledMemory,
} from "@/lib/business-memory";

type Db = Pick<SupabaseClient, "from" | "rpc">;

export type MemoryContext = { organizationId: string; actor: MemoryActor };
export type MemoryDeps = { admin?: Db; embed?: { apiKey?: string | null; fetcher?: typeof fetch } };

export type MemoryResult = { ok: true; row: BusinessMemoryRow; duplicate?: boolean } | { ok: false; problem: string };

const COLUMNS =
  "id, organization_id, kind, key, value, status, source_type, source_id, source_quote, fetched_at, superseded_by, created_by, confirmed_by, confirmed_at, deleted_at, created_at, updated_at";
const LIVE_STATUSES = ["proposed", "confirmed"];
const MAX_LIST = 200;
const keyOf = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** Old/new values in a history event: short strings only, so they serialise cleanly. */
export type EventValue = Record<string, string | null>;
type EventAction = "proposed" | "confirmed" | "edited" | "superseded" | "deleted" | "restored";

async function recordEvent(
  db: Db,
  ctx: MemoryContext,
  memoryId: string,
  action: EventAction,
  oldValue: EventValue | null,
  newValue: EventValue | null,
): Promise<void> {
  try {
    const { error } = await db.from("business_memory_events").insert({
      memory_id: memoryId,
      organization_id: ctx.organizationId,
      action,
      actor_kind: ctx.actor.kind,
      actor_id: ctx.actor.userId,
      old_value: oldValue,
      new_value: newValue,
    });
    if (error) console.warn("business memory: history event not saved", error.message);
  } catch (error) {
    console.warn("business memory: history event not saved", error instanceof Error ? error.message : error);
  }
}

/** Best-effort vector for one row. Never throws. */
export async function indexBusinessMemory(deps: MemoryDeps, row: BusinessMemoryRow): Promise<boolean> {
  if (!deps.admin) return false;
  try {
    const vectors = await import("@/lib/jarvis-memory-vectors.server");
    const text = memoryEmbeddingText(row);
    const embedded = await vectors.embedTexts([text], deps.embed ?? {});
    if (!embedded) return false;
    const { error } = await deps.admin.from("business_memory_embeddings").upsert(
      {
        memory_id: row.id,
        organization_id: row.organization_id,
        model: vectors.MEMORY_EMBEDDING_MODEL,
        content_hash: await vectors.contentHash(text),
        embedding: vectors.toVectorLiteral(embedded[0]!),
      },
      { onConflict: "memory_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

async function loadRow(db: Db, ctx: MemoryContext, id: string): Promise<BusinessMemoryRow | null> {
  const { data, error } = await db
    .from("business_memory")
    .select(COLUMNS)
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as BusinessMemoryRow;
  return row.organization_id === ctx.organizationId ? row : null;
}

async function liveRows(db: Db, ctx: MemoryContext, kind?: MemoryKind): Promise<BusinessMemoryRow[]> {
  let query = db
    .from("business_memory")
    .select(COLUMNS)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .in("status", LIVE_STATUSES);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_LIST);
  if (error || !Array.isArray(data)) return [];
  return (data as BusinessMemoryRow[]).filter((row) => row.organization_id === ctx.organizationId);
}

function requireOwner(ctx: MemoryContext): string | null {
  return ctx.actor.kind === "owner" && ctx.actor.userId ? null : "Only the business owner can do that.";
}

/** Marks a confirmed row superseded so a newer answer can take its label. */
async function supersede(db: Db, ctx: MemoryContext, old: BusinessMemoryRow, replacementId: string | null): Promise<boolean> {
  const { error } = await db
    .from("business_memory")
    .update({ status: "superseded", superseded_by: replacementId, updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.organizationId)
    .eq("id", old.id)
    .eq("status", "confirmed");
  if (error) return false;
  await recordEvent(db, ctx, old.id, "superseded", { status: "confirmed", value: old.value }, { status: "superseded", superseded_by: replacementId });
  return true;
}

/**
 * Saves one memory. A signed-in owner's own words are saved confirmed (and
 * replace any confirmed note with the same label); anything from the assistant,
 * a web page or an import is saved as proposed.
 */
export async function recordMemory(db: Db, ctx: MemoryContext, input: NewMemoryInput, deps: MemoryDeps = {}): Promise<MemoryResult> {
  const checked = checkNewMemory(input);
  if (!checked.ok) return checked;
  const memory = checked.memory;
  const status = initialStatus(ctx.actor, memory.sourceType);

  const existing = (await liveRows(db, ctx, memory.kind)).filter((row) => keyOf(row.key) === keyOf(memory.key));
  const same = existing.find((row) => keyOf(row.value) === keyOf(memory.value));
  if (same && (same.status === "confirmed" || status === "proposed")) return { ok: true, row: same, duplicate: true };
  // The owner restating a note the assistant had only proposed confirms that note.
  if (same && status === "confirmed") return confirmMemory(db, ctx, same.id, deps);

  const previous = status === "confirmed" ? existing.find((row) => row.status === "confirmed") : undefined;
  if (previous && !(await supersede(db, ctx, previous, null))) return { ok: false, problem: "That note could not be saved. Try again." };

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("business_memory")
    .insert({
      organization_id: ctx.organizationId,
      kind: memory.kind,
      key: memory.key,
      value: memory.value,
      status,
      source_type: memory.sourceType,
      source_id: memory.sourceId,
      source_quote: memory.sourceQuote,
      fetched_at: memory.fetchedAt,
      created_by: ctx.actor.userId,
      ...(status === "confirmed" ? { confirmed_by: ctx.actor.userId, confirmed_at: now } : {}),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    if (previous) await db.from("business_memory").update({ status: "confirmed", superseded_by: null }).eq("organization_id", ctx.organizationId).eq("id", previous.id);
    return { ok: false, problem: "That note could not be saved. Try again." };
  }
  const row = data as BusinessMemoryRow;
  if (previous) await db.from("business_memory").update({ superseded_by: row.id }).eq("organization_id", ctx.organizationId).eq("id", previous.id);
  await recordEvent(db, ctx, row.id, status === "confirmed" ? "confirmed" : "proposed", previous ? { value: previous.value } : null, { key: row.key, value: row.value, source_type: row.source_type, source_id: row.source_id });
  await indexBusinessMemory(deps, row);
  return { ok: true, row };
}

/** Owner taps Confirm on a proposed note. */
export async function confirmMemory(db: Db, ctx: MemoryContext, id: string, deps: MemoryDeps = {}): Promise<MemoryResult> {
  const denied = requireOwner(ctx);
  if (denied) return { ok: false, problem: denied };
  const row = await loadRow(db, ctx, id);
  if (!row || row.deleted_at) return { ok: false, problem: "That note could not be found." };
  if (row.status === "confirmed") return { ok: true, row, duplicate: true };
  if (row.status !== "proposed") return { ok: false, problem: "That note was replaced by a newer one." };

  const previous = (await liveRows(db, ctx, row.kind)).find((other) => other.id !== row.id && other.status === "confirmed" && keyOf(other.key) === keyOf(row.key));
  if (previous && !(await supersede(db, ctx, previous, row.id))) return { ok: false, problem: "That note could not be confirmed. Try again." };

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("business_memory")
    .update({ status: "confirmed", confirmed_by: ctx.actor.userId, confirmed_at: now, updated_at: now })
    .eq("organization_id", ctx.organizationId)
    .eq("id", row.id)
    .eq("status", "proposed")
    .select(COLUMNS)
    .single();
  if (error || !data) return { ok: false, problem: "That note could not be confirmed. Try again." };
  await recordEvent(db, ctx, row.id, "confirmed", { status: "proposed" }, { status: "confirmed" });
  return { ok: true, row: data as BusinessMemoryRow };
}

/** Owner edits the label or text. The history keeps the old and new values and who changed them. */
export async function editMemory(db: Db, ctx: MemoryContext, id: string, changes: { key?: string; value?: string }, deps: MemoryDeps = {}): Promise<MemoryResult> {
  const denied = requireOwner(ctx);
  if (denied) return { ok: false, problem: denied };
  const row = await loadRow(db, ctx, id);
  if (!row || row.deleted_at || row.status === "superseded") return { ok: false, problem: "That note could not be found." };
  const checked = checkNewMemory({
    kind: row.kind,
    key: changes.key ?? row.key,
    value: changes.value ?? row.value,
    sourceType: row.source_type,
    sourceId: row.source_id,
  });
  if (!checked.ok) return checked;
  if (checked.memory.key === row.key && checked.memory.value === row.value) return { ok: true, row, duplicate: true };

  const { data, error } = await db
    .from("business_memory")
    .update({ key: checked.memory.key, value: checked.memory.value, updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.organizationId)
    .eq("id", row.id)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, problem: "That note could not be changed. Another confirmed note may already use that label." };
  }
  await recordEvent(db, ctx, row.id, "edited", { key: row.key, value: row.value }, { key: checked.memory.key, value: checked.memory.value });
  const updated = data as BusinessMemoryRow;
  await indexBusinessMemory(deps, updated);
  return { ok: true, row: updated };
}

/** Soft delete: the row and its history stay, but it is never listed or recalled again. */
export async function deleteMemory(db: Db, ctx: MemoryContext, id: string): Promise<MemoryResult> {
  const denied = requireOwner(ctx);
  if (denied) return { ok: false, problem: denied };
  const row = await loadRow(db, ctx, id);
  if (!row || row.deleted_at) return { ok: false, problem: "That note could not be found." };
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("business_memory")
    .update({ deleted_at: now, updated_at: now })
    .eq("organization_id", ctx.organizationId)
    .eq("id", row.id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .single();
  if (error || !data) return { ok: false, problem: "That note could not be deleted. Try again." };
  await recordEvent(db, ctx, row.id, "deleted", { status: row.status, key: row.key, value: row.value }, null);
  return { ok: true, row: data as BusinessMemoryRow };
}

/** The owner's saved notes, newest first. Deleted notes are never listed. */
export async function listMemory(db: Db, ctx: MemoryContext, options: { statuses?: ("proposed" | "confirmed" | "superseded")[] } = {}): Promise<BusinessMemoryRow[]> {
  const statuses = options.statuses ?? LIVE_STATUSES;
  const { data, error } = await db
    .from("business_memory")
    .select(COLUMNS)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error || !Array.isArray(data)) return [];
  return (data as BusinessMemoryRow[]).filter((row) => row.organization_id === ctx.organizationId);
}

export type MemoryEventRow = {
  id: number;
  memory_id: string;
  action: EventAction;
  actor_kind: string;
  actor_id: string | null;
  old_value: EventValue | null;
  new_value: EventValue | null;
  created_at: string;
};

/** Change history for one note ("why was this saved", who edited it). */
export async function memoryHistory(db: Db, ctx: MemoryContext, memoryId: string): Promise<MemoryEventRow[]> {
  const { data, error } = await db
    .from("business_memory_events")
    .select("id, memory_id, action, actor_kind, actor_id, old_value, new_value, created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("memory_id", memoryId)
    .order("id", { ascending: true })
    .limit(100);
  return error || !Array.isArray(data) ? [] : (data as MemoryEventRow[]);
}

const SITE_NOTE_LABEL: Record<string, string> = { rule: "Site rule", decision: "Site decision", outcome: "Site outcome", avoid: "Site: avoid" };

/**
 * Copies the owner's website notes in as PROPOSED facts that name their source
 * (the note id). Running it again skips notes that were already imported.
 */
export async function importWebsiteMemory(db: Db, ctx: MemoryContext): Promise<{ imported: number; skipped: number }> {
  const { data, error } = await db
    .from("website_memory")
    .select("id, kind, text")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error || !Array.isArray(data)) return { imported: 0, skipped: 0 };
  const notes = data as { id: string; kind: string; text: string }[];
  const have = await db
    .from("business_memory")
    .select("source_id")
    .eq("organization_id", ctx.organizationId)
    .eq("source_type", "website_memory");
  const done = new Set(((have.data ?? []) as { source_id: string | null }[]).map((row) => row.source_id));
  let imported = 0;
  for (const note of notes) {
    if (done.has(note.id)) continue;
    const label = `${SITE_NOTE_LABEL[note.kind] ?? "Site note"}: ${note.text}`.slice(0, 120);
    const saved = await recordMemory(db, { ...ctx, actor: { kind: "system", userId: null } }, { kind: "fact", key: label, value: note.text, sourceType: "website_memory", sourceId: note.id });
    if (saved.ok && !saved.duplicate) imported += 1;
  }
  return { imported, skipped: notes.length - imported };
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/**
 * Top-k notes for a question, for this workspace only. Semantic (pgvector) when
 * embeddings work; otherwise word overlap. Confirmed notes win ties. Every
 * result carries a plain-words source line, and proposed notes say so.
 */
export async function recallMemory(db: Db, ctx: MemoryContext, query: string, options: { limit?: number } = {}, deps: MemoryDeps = {}): Promise<RecalledMemory[]> {
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 20);
  const text = query.trim();
  if (!text) return [];

  const similarity = new Map<string, number>();
  if (deps.admin) {
    try {
      const vectors = await import("@/lib/jarvis-memory-vectors.server");
      const embedded = await vectors.embedTexts([text], deps.embed ?? {});
      if (embedded) {
        const { data, error } = await deps.admin.rpc("match_business_memory", {
          p_org_id: ctx.organizationId,
          p_query: vectors.toVectorLiteral(embedded[0]!),
          p_limit: limit * 2,
        });
        if (!error && Array.isArray(data)) {
          for (const hit of data as { memory_id?: unknown; similarity?: unknown }[]) {
            if (typeof hit.memory_id === "string" && typeof hit.similarity === "number" && Number.isFinite(hit.similarity)) similarity.set(hit.memory_id, hit.similarity);
          }
        }
      }
    } catch {
      similarity.clear();
    }
  }

  const rows = await liveRows(db, ctx);
  if (similarity.size) {
    return rows
      .filter((row) => similarity.has(row.id))
      .sort((a, b) => similarity.get(b.id)! - similarity.get(a.id)! || Number(b.status === "confirmed") - Number(a.status === "confirmed"))
      .slice(0, limit)
      .map((row) => toRecalled(row, similarity.get(row.id)!));
  }

  const wanted = words(text);
  return rows
    .map((row) => {
      const overlap = [...words(`${row.key} ${row.value}`)].filter((word) => wanted.has(word)).length;
      return { row, overlap };
    })
    .filter((hit) => hit.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || Number(b.row.status === "confirmed") - Number(a.row.status === "confirmed"))
    .slice(0, limit)
    .map((hit) => toRecalled(hit.row, null));
}
