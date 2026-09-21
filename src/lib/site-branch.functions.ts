import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyWebsiteRestore,
  readWebsiteState,
  type RestoreClient,
  type StateReader,
} from "@/lib/site-restore.functions";
import { readFullSnapshot } from "@/lib/site-restore";
import {
  branchChange,
  canStartBranch,
  describeBranchChange,
  normaliseBranchLabel,
  readBranchChange,
  type DraftBranch,
} from "@/lib/builder/draft-branch";

/**
 * Draft branches — the database layer.
 *
 * Starting a draft records an exact copy of the website as it is now. Keeping
 * the draft just closes it, because the working website already is the result.
 * Throwing it away restores the recorded copy through the same atomic restore
 * used by restore points, so nothing is ever left half-changed.
 *
 * Every read and write goes through the caller's own session, so row level
 * security keeps one workspace out of another's website.
 */

const uuid = (value: unknown) => {
  const id = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid workspace");
  return id;
};

type BranchRow = {
  id: string;
  label: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  summary: unknown;
};

const BRANCH_COLUMNS = "id, label, status, created_at, closed_at, summary";

function toBranch(row: BranchRow): DraftBranch {
  return {
    id: row.id,
    label: row.label,
    status: row.status === "kept" || row.status === "discarded" ? row.status : "open",
    createdAt: row.created_at,
    closedAt: row.closed_at,
    summary: readBranchChange(row.summary),
  };
}

export const listSiteBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string }) => ({
    organizationId: uuid(data?.organizationId),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("website_branches")
      .select(BRANCH_COLUMNS)
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Couldn't read your drafts right now.");
    const branches = ((rows ?? []) as BranchRow[]).map(toBranch);
    const open = branches.find((branch) => branch.status === "open") ?? null;

    // While a draft is open, show how far it has diverged from its starting copy.
    let liveChange: ReturnType<typeof branchChange> | null = null;
    if (open) {
      const { data: openRow } = await context.supabase
        .from("website_branches")
        .select("base_snapshot")
        .eq("id", open.id)
        .maybeSingle();
      const base = readFullSnapshot((openRow as { base_snapshot?: unknown } | null)?.base_snapshot);
      if (base) {
        const current = await readWebsiteState(
          context.supabase as never as StateReader,
          data.organizationId,
        );
        liveChange = branchChange(base, current);
      }
    }

    return {
      branches,
      open,
      liveChange,
      liveSummary: liveChange ? describeBranchChange(liveChange) : null,
    };
  });

export const startSiteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; label?: string }) => ({
    organizationId: uuid(data?.organizationId),
    label: normaliseBranchLabel(data?.label),
  }))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("website_branches")
      .select(BRANCH_COLUMNS)
      .eq("organization_id", data.organizationId)
      .eq("status", "open")
      .maybeSingle();
    const guard = canStartBranch(existing ? toBranch(existing as BranchRow) : null);
    if (!guard.ok) throw new Error(guard.reason);

    const base = await readWebsiteState(
      context.supabase as never as StateReader,
      data.organizationId,
    );

    const { data: row, error } = await context.supabase
      .from("website_branches")
      .insert({
        organization_id: data.organizationId,
        label: data.label,
        status: "open",
        base_snapshot: base as never,
        created_by: context.userId,
      })
      .select(BRANCH_COLUMNS)
      .single();
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only an owner, admin or manager can start a draft."
          : "Couldn't start a draft right now. Your website is unchanged.",
      );

    return { branch: toBranch(row as BranchRow) };
  });

/** Keeps the draft: the working website already holds the changes. */
export const keepSiteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; branchId: string }) => ({
    organizationId: uuid(data?.organizationId),
    branchId: uuid(data?.branchId),
  }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("website_branches")
      .select("id, status, base_snapshot")
      .eq("id", data.branchId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!row || (row as { status: string }).status !== "open")
      throw new Error("That draft is already closed.");

    const base = readFullSnapshot((row as { base_snapshot?: unknown }).base_snapshot);
    const current = await readWebsiteState(
      context.supabase as never as StateReader,
      data.organizationId,
    );
    const change = base ? branchChange(base, current) : null;

    const { error } = await context.supabase
      .from("website_branches")
      .update({
        status: "kept",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
        base_snapshot: null,
        summary: (change ?? {}) as never,
      })
      .eq("id", data.branchId)
      .eq("organization_id", data.organizationId);
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only an owner, admin or manager can keep a draft."
          : "Couldn't close the draft right now. Your changes are still there.",
      );

    return {
      kept: true,
      summary: change
        ? `Draft kept. ${describeBranchChange(change)}`
        : "Draft kept. Your website keeps the changes you made.",
    };
  });

/** Throws the draft away: the website goes back exactly as it was. */
export const discardSiteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; branchId: string }) => ({
    organizationId: uuid(data?.organizationId),
    branchId: uuid(data?.branchId),
  }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("website_branches")
      .select("id, status, base_snapshot")
      .eq("id", data.branchId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!row || (row as { status: string }).status !== "open")
      throw new Error("That draft is already closed.");

    const base = readFullSnapshot((row as { base_snapshot?: unknown }).base_snapshot);
    if (!base)
      throw new Error(
        "The copy taken when this draft started can no longer be read, so nothing was changed.",
      );

    const result = await applyWebsiteRestore(
      context.supabase as never as RestoreClient,
      data.organizationId,
      base,
    );

    // Only close the draft once the website really went back.
    const { error } = await context.supabase
      .from("website_branches")
      .update({
        status: "discarded",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
        base_snapshot: null,
        summary: {} as never,
      })
      .eq("id", data.branchId)
      .eq("organization_id", data.organizationId);
    if (error)
      throw new Error(
        "Your website was put back, but the draft couldn't be closed. Try closing it again.",
      );

    return { discarded: true, exact: result.exact, summary: result.summary };
  });
