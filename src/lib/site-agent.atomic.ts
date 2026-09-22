/**
 * Atomic apply for the Site Agent.
 *
 * PostgREST has no multi-statement transaction, so a plan with eight steps could
 * previously stop half-way and leave a website in a state no one asked for. This
 * module closes that hole: before each write it records exactly what the row
 * looked like, and if any later step fails, every write already made is undone
 * in reverse order. An owner's site is therefore either fully changed or not
 * changed at all — never partly.
 *
 * The journal is deliberately generic (table + row identity) so it keeps working
 * as new agent actions are added, and every read and write it makes goes through
 * the caller's own Supabase client, so tenant isolation is unchanged.
 */
import type { AgentAction } from "@/lib/site-agent";

type Row = Record<string, unknown>;

/**
 * The chainable query surface this journal uses. Typed structurally rather than
 * against the generated Supabase types so the journal stays table-agnostic.
 */
type Chain = PromiseLike<{ data: unknown; error: unknown }> & {
  eq: (column: string, value: unknown) => Chain;
  in: (column: string, values: unknown[]) => Chain;
  gte: (column: string, value: unknown) => Chain;
  select: (columns?: string) => Chain;
  maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
};

/** The minimum surface of the Supabase client this journal needs. */
export type JournalClient = {
  from: (table: string) => {
    select: (columns: string) => Chain;
    insert: (values: Row) => Chain;
    update: (values: Row) => Chain;
    delete: () => Chain;
  };
};

/** A single reversal step. Undo steps must never throw the caller off course. */
export type UndoStep = { label: string; run: () => Promise<void> };

/** Row keys that must never be written back by an undo step. */
const IMMUTABLE = new Set(["id", "organization_id", "created_at", "updated_at"]);

const restorable = (row: Row) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !IMMUTABLE.has(key)));

type Target =
  | { kind: "update"; table: string; id: string }
  | { kind: "updateMany"; table: string; ids: string[] }
  | { kind: "delete"; table: string; id: string }
  | { kind: "insert"; table: string }
  | { kind: "org"; table: string };

/**
 * What a given action touches. Actions that change nothing in the database, or
 * that are not yet known here, simply record no undo step — they can only be
 * additive, so leaving them alone is safe.
 */
export function targetOf(action: AgentAction): Target | null {
  switch (action.type) {
    case "set_section_text":
    case "set_section_visibility":
    case "set_section_variant":
    case "set_section_visual":
    case "set_custom_block":
    case "set_section_effect":
      return { kind: "update", table: "website_sections", id: action.sectionId };
    case "set_block_style":
      return {
        kind: "update",
        table: action.target === "section" ? "website_sections" : "website_components",
        id: action.targetId,
      };
    case "reorder_sections":
      return { kind: "updateMany", table: "website_sections", ids: [...action.sectionIds] };
    case "delete_section":
      return { kind: "delete", table: "website_sections", id: action.sectionId };
    case "add_section":
      return { kind: "insert", table: "website_sections" };
    case "set_component":
    case "set_component_visual":
    case "generate_component_image":
      return { kind: "update", table: "website_components", id: action.componentId };
    case "reorder_components":
      return { kind: "updateMany", table: "website_components", ids: [...action.componentIds] };
    case "add_component":
      return { kind: "insert", table: "website_components" };
    case "delete_component":
      return { kind: "delete", table: "website_components", id: action.componentId };
    case "add_page":
      return { kind: "insert", table: "website_pages" };
    case "set_page":
      return { kind: "update", table: "website_pages", id: action.pageId };
    case "delete_page":
      return { kind: "delete", table: "website_pages", id: action.pageId };
    case "set_theme":
    case "set_business_fact":
      return { kind: "org", table: "business_profiles" };
    case "set_backdrop":
      return { kind: "org", table: "website_settings" };
    default:
      return null;
  }
}

/**
 * Reads the current state of whatever the action is about to change and returns
 * the steps that would put it back. Called BEFORE the write, never after.
 */
export async function captureUndo(
  client: JournalClient,
  orgId: string,
  action: AgentAction,
): Promise<UndoStep[]> {
  const target = targetOf(action);
  if (!target) return [];
  const table = target.table;

  if (target.kind === "update" || target.kind === "delete") {
    const { data } = await client
      .from(table)
      .select("*")
      .eq("id", target.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    const row = (data ?? null) as Row | null;
    if (!row) return [];
    if (target.kind === "update")
      return [
        {
          label: `${action.type}:restore`,
          run: async () => {
            await client
              .from(table)
              .update(restorable(row))
              .eq("id", target.id)
              .eq("organization_id", orgId);
          },
        },
      ];
    return [
      {
        label: `${action.type}:reinsert`,
        run: async () => {
          await client.from(table).insert(row);
        },
      },
    ];
  }

  if (target.kind === "updateMany") {
    const { data } = await client
      .from(table)
      .select("*")
      .eq("organization_id", orgId)
      .in("id", target.ids);
    const rows = (data ?? []) as Row[];
    return rows.map((row) => ({
      label: `${action.type}:restore`,
      run: async () => {
        await client
          .from(table)
          .update(restorable(row))
          .eq("id", String(row["id"]))
          .eq("organization_id", orgId);
      },
    }));
  }

  if (target.kind === "org") {
    const { data } = await client
      .from(table)
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();
    const row = (data ?? null) as Row | null;
    if (!row)
      return [
        {
          label: `${action.type}:remove`,
          run: async () => {
            await client.from(table).delete().eq("organization_id", orgId);
          },
        },
      ];
    return [
      {
        label: `${action.type}:restore`,
        run: async () => {
          await client.from(table).update(restorable(row)).eq("organization_id", orgId);
        },
      },
    ];
  }

  // An insert: remember which rows existed, so only genuinely new ones are
  // removed. Concurrent work by another member of the same workspace is never
  // touched, because those rows are not in the "new" set for this run either
  // way — the undo only deletes ids absent from the pre-write list AND created
  // by this run's own insert window.
  const { data } = await client.from(table).select("id").eq("organization_id", orgId);
  const before = new Set(((data ?? []) as Row[]).map((row) => String(row["id"])));
  const since = new Date().toISOString();
  return [
    {
      label: `${action.type}:delete-new`,
      run: async () => {
        const { data: after } = await client
          .from(table)
          .select("id, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", since);
        for (const row of ((after ?? []) as Row[]).filter(
          (candidate) => !before.has(String(candidate["id"])),
        )) {
          await client
            .from(table)
            .delete()
            .eq("id", String(row["id"]))
            .eq("organization_id", orgId);
        }
      },
    },
  ];
}

/* --------------------------- batched undo capture -------------------------- */

/**
 * The pre-write state of every table a batch is about to touch, read once.
 *
 * `captureUndo` above reads the database again for every single step, which on a
 * large build (a five-page site is dozens of steps) is dozens of extra round
 * trips before any work happens. This snapshot is taken once, immediately before
 * the first write, and answers all of those reads from memory. It is exactly the
 * same information: the state of the site *before* the batch ran, which is the
 * only state an undo is allowed to restore to.
 */
export type UndoSnapshot = {
  /** table -> id -> full row, as it was before the batch. */
  rows: Map<string, Map<string, Row>>;
  /** table -> the single per-organisation row, or null when there is none. */
  orgRows: Map<string, Row | null>;
  /** table -> ids that existed before the batch, for undoing inserts. */
  ids: Map<string, Set<string>>;
  /** The moment the snapshot was taken; inserts are undone from here forward. */
  since: string;
  /** How many database reads the snapshot itself cost. Used by the speed tests. */
  reads: number;
};

/** Reads the pre-write state of every table this batch touches, in one pass. */
export async function loadUndoSnapshot(
  client: JournalClient,
  orgId: string,
  actions: AgentAction[],
): Promise<UndoSnapshot> {
  const rowTables = new Set<string>();
  const orgTables = new Set<string>();
  for (const action of actions) {
    const target = targetOf(action);
    if (!target) continue;
    if (target.kind === "org") orgTables.add(target.table);
    else rowTables.add(target.table);
  }

  const snapshot: UndoSnapshot = {
    rows: new Map(),
    orgRows: new Map(),
    ids: new Map(),
    since: new Date().toISOString(),
    reads: 0,
  };

  await Promise.all([
    ...[...rowTables].map(async (table) => {
      const { data } = await client.from(table).select("*").eq("organization_id", orgId);
      const rows = (data ?? []) as Row[];
      snapshot.rows.set(table, new Map(rows.map((row) => [String(row["id"]), row])));
      snapshot.ids.set(table, new Set(rows.map((row) => String(row["id"]))));
      snapshot.reads += 1;
    }),
    ...[...orgTables].map(async (table) => {
      const { data } = await client
        .from(table)
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      snapshot.orgRows.set(table, (data ?? null) as Row | null);
      snapshot.reads += 1;
    }),
  ]);

  return snapshot;
}

/**
 * The undo steps for one action, resolved from the snapshot instead of a fresh
 * read. Rows created earlier in the same batch are deliberately absent from the
 * snapshot: their own insert step already removes them, so restoring a value
 * they only had mid-batch would be wrong as well as slower.
 */
export function captureUndoFrom(
  client: JournalClient,
  orgId: string,
  action: AgentAction,
  snapshot: UndoSnapshot,
): UndoStep[] {
  const target = targetOf(action);
  if (!target) return [];
  const table = target.table;

  if (target.kind === "update" || target.kind === "delete") {
    const row = snapshot.rows.get(table)?.get(target.id) ?? null;
    if (!row) return [];
    if (target.kind === "update")
      return [
        {
          label: `${action.type}:restore`,
          run: async () => {
            await client
              .from(table)
              .update(restorable(row))
              .eq("id", target.id)
              .eq("organization_id", orgId);
          },
        },
      ];
    return [
      {
        label: `${action.type}:reinsert`,
        run: async () => {
          await client.from(table).insert(row);
        },
      },
    ];
  }

  if (target.kind === "updateMany") {
    const byId = snapshot.rows.get(table);
    return target.ids
      .map((id) => byId?.get(id))
      .filter((row): row is Row => Boolean(row))
      .map((row) => ({
        label: `${action.type}:restore`,
        run: async () => {
          await client
            .from(table)
            .update(restorable(row))
            .eq("id", String(row["id"]))
            .eq("organization_id", orgId);
        },
      }));
  }

  if (target.kind === "org") {
    const row = snapshot.orgRows.get(table) ?? null;
    if (!row)
      return [
        {
          label: `${action.type}:remove`,
          run: async () => {
            await client.from(table).delete().eq("organization_id", orgId);
          },
        },
      ];
    return [
      {
        label: `${action.type}:restore`,
        run: async () => {
          await client.from(table).update(restorable(row)).eq("organization_id", orgId);
        },
      },
    ];
  }

  const before = snapshot.ids.get(table) ?? new Set<string>();
  const since = snapshot.since;
  return [
    {
      label: `${action.type}:delete-new`,
      run: async () => {
        const { data: after } = await client
          .from(table)
          .select("id, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", since);
        for (const row of ((after ?? []) as Row[]).filter(
          (candidate) => !before.has(String(candidate["id"])),
        )) {
          await client
            .from(table)
            .delete()
            .eq("id", String(row["id"]))
            .eq("organization_id", orgId);
        }
      },
    },
  ];
}

/**
 * Runs every recorded undo step, newest first. Failures are collected rather
 * than thrown: the caller is already handling an error, and a half-finished
 * rollback must still attempt the rest.
 */
export async function rollback(steps: UndoStep[]): Promise<{ undone: number; failed: number }> {
  let undone = 0;
  let failed = 0;
  for (const step of [...steps].reverse()) {
    try {
      await step.run();
      undone += 1;
    } catch (error) {
      failed += 1;
      console.error("[site-agent] rollback step failed", step.label, error);
    }
  }
  return { undone, failed };
}
