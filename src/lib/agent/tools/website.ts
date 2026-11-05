/**
 * PAI-14 site tools bridge: the builder's existing website changes, exposed as
 * `write_internal` agent tools on the v2 registry.
 *
 * Nothing here re-implements an edit. Every change tool hands its actions to
 * the SAME apply path the builder chat uses (`applyImpl` in
 * site-agent.functions.ts), so it gets the same safety checks, the same
 * restore point taken before anything is written, the same read-back and the
 * same publish rule. The planner is not involved and not changed.
 *
 * Undo: the apply path saves a version before writing; each tool's inverse is
 * "restore that version" (`site.restore_version`). Restoring a version first
 * saves the current draft as a new version, so a restore can be undone too.
 *
 * The workspace always comes from the session; actions are checked against a
 * per-tool allow-list before anything runs. Publishing is never a tool here.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { defineToolV2, type ToolContextV2, type ToolDefinitionV2, type ToolInverse } from "@/lib/ai/tool-registry-v2.server";

/** Which existing action types each tool may carry. Anything else is refused. */
export const SITE_TOOL_ACTIONS = {
  "site.edit_section": [
    "set_section_text",
    "set_section_visibility",
    "set_block_style",
    "set_custom_block",
    "set_composition",
    "set_section_effect",
    "reorder_sections",
    "reorder_components",
    "set_component",
    "set_component_visual",
    "add_component",
    "delete_component",
  ],
  // A new section can be filled in the same call (later steps target its `ref`).
  "site.add_section": ["add_section", "set_section_text", "set_composition", "add_component", "set_component", "set_block_style"],
  "site.remove_section": ["delete_section"],
  "site.set_theme": ["set_theme", "set_design_tokens", "set_premium_fx", "set_backdrop"],
  "site.set_seo": ["set_page"],
} as const;

export type SiteChangeTool = keyof typeof SITE_TOOL_ACTIONS;

/** What the apply path reports back (only the fields the bridge reads). */
export type ApplyOutcome = {
  applied: number;
  failed: number;
  unconfirmed?: unknown[];
  stale?: number;
  unchanged?: number;
  snapshotVersion: number;
  snapshotLabel?: string;
  operationId?: string | null;
  alreadyApplied?: boolean;
  live?: { published: boolean; reason: string } | null;
  details?: string[];
};

export type SiteToolDeps = {
  apply: (supabase: unknown, userId: string, data: { organizationId: string; actions: unknown[]; label: string; verify: boolean; operationKey?: string }) => Promise<ApplyOutcome>;
  restore: (supabase: unknown, organizationId: string, versionId: string) => Promise<unknown>;
};

async function defaultDeps(): Promise<SiteToolDeps> {
  const [{ applyWebsiteActionsForTool }, { restoreVersionInto }] = await Promise.all([
    import("@/lib/site-agent.functions"),
    import("@/lib/site-restore.functions"),
  ]);
  return {
    apply: (supabase, userId, data) => applyWebsiteActionsForTool(supabase, userId, data) as Promise<ApplyOutcome>,
    restore: (supabase, organizationId, versionId) => restoreVersionInto(supabase as never, organizationId, versionId),
  };
}

const actionSchema = z.looseObject({ type: z.string().min(1).max(40) });
const changeSchema = z.strictObject({
  actions: z.array(actionSchema).min(1).max(60),
  /** Name of the restore point saved before the change. */
  label: z.string().trim().min(1).max(110).optional(),
});

/**
 * Same run + step + arguments = the same operation key, so a retried step is
 * answered by the apply path's own "already applied" record instead of
 * writing twice. Outside a run, every call is its own operation.
 */
export function operationKeyFor(tool: string, input: unknown, context: Pick<ToolContextV2, "runId" | "stepId">): string | undefined {
  if (!context.runId) return undefined;
  const digest = createHash("sha256").update(`${tool}\n${context.stepId ?? ""}\n${JSON.stringify(input)}`).digest("hex").slice(0, 24);
  return `${context.runId.slice(0, 40)}:${digest}`;
}

/** The undo for a change: put back the version saved just before it. */
export function restoreInverse(version: number | null | undefined): ToolInverse | null {
  return version && version > 0 ? { tool: "site.restore_version", arguments: { version } } : null;
}

function changeTool(name: SiteChangeTool, description: string, deps?: SiteToolDeps) {
  const allowed = new Set<string>(SITE_TOOL_ACTIONS[name]);
  return defineToolV2({
    name,
    description,
    risk: "write_internal",
    scope: "owner",
    schema: changeSchema,
    timeoutMs: 120_000,
    run: async (input, context) => {
      const refused = input.actions.map((action) => action.type).filter((type) => !allowed.has(type));
      if (refused.length) throw new Error(`${name} can't carry ${[...new Set(refused)].join(", ")}. Use the matching site tool.`);
      const { apply } = deps ?? (await defaultDeps());
      const operationKey = operationKeyFor(name, input, context);
      const outcome = await apply(context.supabase, context.userId, {
        organizationId: context.organizationId,
        actions: input.actions,
        label: input.label ?? "Before Revora AI changes",
        verify: true,
        ...(operationKey ? { operationKey } : {}),
      });
      if (outcome.applied === 0 && outcome.failed > 0)
        throw new Error(outcome.details?.find((line) => line.startsWith("skipped")) ?? "None of those changes could be saved.");
      return {
        applied: outcome.applied,
        failed: outcome.failed,
        unconfirmed: outcome.unconfirmed?.length ?? 0,
        stale: outcome.stale ?? 0,
        unchanged: outcome.unchanged ?? 0,
        restorePoint: outcome.snapshotVersion > 0 ? { version: outcome.snapshotVersion, label: outcome.snapshotLabel ?? null } : null,
        alreadyApplied: Boolean(outcome.alreadyApplied),
        live: outcome.live ?? null,
        details: (outcome.details ?? []).slice(0, 30),
      };
    },
    inverse: (_input, result) => restoreInverse((result as { restorePoint?: { version?: number } | null })?.restorePoint?.version),
  });
}

type VersionLookup = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        order: (column: string, options: { ascending: boolean }) => {
          limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
  };
};

/**
 * Saves the current draft (pages + look + SEO) as a new version, the same
 * shape the apply path's restore point uses. Retries on a version collision.
 */
export async function saveCurrentDraft(context: ToolContextV2, label: string): Promise<number> {
  const db = context.supabase as unknown as VersionLookup;
  const [{ readWebsiteState }, settings, latest] = await Promise.all([
    import("@/lib/site-restore.functions"),
    db.from("website_settings").select("generation, seo").eq("organization_id", context.organizationId).maybeSingle(),
    db.from("website_versions").select("version").eq("organization_id", context.organizationId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const pages = await readWebsiteState(context.supabase as never, context.organizationId);
  const look = (settings.data ?? {}) as { generation?: unknown; seo?: unknown };
  let version = Number((latest.data as { version?: number } | null)?.version ?? 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    version += 1;
    const { data } = await db
      .from("website_versions")
      .insert({
        organization_id: context.organizationId,
        version,
        label,
        pages,
        ...(look.generation ? { generation: look.generation } : {}),
        ...(look.seo ? { seo: look.seo } : {}),
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if ((data as { id?: string } | null)?.id) return version;
  }
  throw new Error("Couldn't save your current draft first, so nothing was changed.");
}

function restoreTool(deps?: SiteToolDeps) {
  return defineToolV2({
    name: "site.restore_version",
    description: "Put the website draft back to a saved version (by version number). The current draft is saved as a new version first, so this can be undone.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ version: z.number().int().min(1).max(1_000_000) }),
    timeoutMs: 120_000,
    run: async (input, context) => {
      const db = context.supabase as unknown as VersionLookup;
      const { data, error } = await db
        .from("website_versions")
        .select("id, version")
        .eq("organization_id", context.organizationId)
        .eq("version", input.version)
        .maybeSingle();
      if (error) throw new Error("Couldn't read that version right now.");
      const row = data as { id?: string } | null;
      if (!row?.id) throw new Error("That version is no longer available.");
      const backup = await saveCurrentDraft(context, `Before Revora AI restored version ${input.version}`);
      const { restore } = deps ?? (await defaultDeps());
      const result = (await restore(context.supabase, context.organizationId, row.id)) as Record<string, unknown>;
      return { ...result, restoredFrom: input.version, restorePoint: { version: backup } };
    },
    inverse: (_input, result) => restoreInverse((result as { restorePoint?: { version?: number } })?.restorePoint?.version),
  });
}

/** The website write tools (PAI-14). Register them with `createToolRegistryV2`. */
export function siteTools(deps?: SiteToolDeps): ToolDefinitionV2<z.ZodType>[] {
  return [
    changeTool("site.edit_section", "Change existing sections: text, visibility, style, layout, components, order. Actions use the builder's action format; a restore point is saved first.", deps),
    changeTool("site.add_section", "Add a section to a page (and fill it in the same call). A restore point is saved first.", deps),
    changeTool("site.remove_section", "Remove sections. A restore point is saved first, so this can be undone.", deps),
    changeTool("site.set_theme", "Change the site's theme, design tokens, effects or background. A restore point is saved first.", deps),
    changeTool("site.set_seo", "Change a page's search title, description or indexing. A restore point is saved first.", deps),
    restoreTool(deps),
  ] as unknown as ToolDefinitionV2<z.ZodType>[];
}
