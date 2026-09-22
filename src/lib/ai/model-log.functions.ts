/**
 * Model response log for the builder.
 *
 * Answers one question for the website owner: which model produced this
 * layout, this section, this wording or this picture, and did it work.
 *
 * Two truthful sources are merged, nothing is inferred:
 *  - `ai_generations`  — one row per builder decision (plan, sections, copy,
 *    metadata, pictures), carrying the model that produced it.
 *  - `ai_usage_events` — one row per model call, carrying provider, model,
 *    latency and outcome. That table is service-role only, so it is read with
 *    the admin client AFTER the caller's membership of the workspace has been
 *    verified with their own credentials.
 *
 * Never returned: prompts, keys, generated content bodies, or another
 * workspace's rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ModelLogScope =
  | "layout"
  | "section"
  | "image"
  | "copy"
  | "metadata"
  | "review"
  | "other";

export type ModelLogEntry = {
  id: string;
  at: string;
  scope: ModelLogScope;
  /** Plain-language description of what was asked for. */
  label: string;
  provider: string | null;
  model: string;
  ok: boolean;
  latencyMs: number | null;
  /** Short reason when a call did not work. Never a raw stack trace. */
  note: string | null;
  source: "decision" | "call";
};

export type ModelLog = {
  entries: ModelLogEntry[];
  byModel: { model: string; provider: string | null; entries: number; failures: number }[];
  /** True when the workspace has no recorded AI activity yet. */
  empty: boolean;
};

const SCOPE_WORDS: { match: RegExp; scope: ModelLogScope; label: string }[] = [
  { match: /image|picture|photo|sunburst|flare/i, scope: "image", label: "Picture" },
  { match: /plan|architecture|page_set|pages|layout|design|creative|brief/i, scope: "layout", label: "Layout & pages" },
  { match: /section|component|block/i, scope: "section", label: "Section" },
  { match: /copy|content|word|rewrite|text/i, scope: "copy", label: "Wording" },
  { match: /meta|seo|schema|slug|sitemap/i, scope: "metadata", label: "Search details" },
  { match: /review|verify|qa|audit|repair/i, scope: "review", label: "Quality review" },
];

function classify(raw: string): { scope: ModelLogScope; label: string } {
  for (const entry of SCOPE_WORDS)
    if (entry.match.test(raw)) return { scope: entry.scope, label: entry.label };
  return { scope: "other", label: "Builder request" };
}

function humanKind(raw: string) {
  return raw.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
}

export const getBuilderModelLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; limit?: number }) => {
    const organizationId = String(input?.organizationId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    const limit = Number(input?.limit ?? 60);
    return { organizationId, limit: Number.isFinite(limit) ? Math.min(Math.max(10, limit), 200) : 60 };
  })
  .handler(async ({ data, context }): Promise<ModelLog> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(
      context.supabase as unknown as Parameters<typeof requireOrgRole>[0],
      data.organizationId,
      String(context.userId),
      "viewer",
    );

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Builder decisions: readable with the caller's own credentials (RLS).
    const decisions = await context.supabase
      .from("ai_generations")
      .select("id, created_at, kind, model, instruction")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const entries: ModelLogEntry[] = [];

    for (const row of decisions.data ?? []) {
      const kind = String(row.kind ?? "");
      const { scope, label } = classify(kind);
      const rolled = /rolled_back|failed|blocked/i.test(kind);
      entries.push({
        id: `d:${row.id}`,
        at: String(row.created_at),
        scope,
        label: `${label} — ${humanKind(kind)}`,
        provider: null,
        model: String(row.model ?? "unknown"),
        ok: !rolled,
        latencyMs: null,
        note: rolled ? "This step was put back exactly as it was." : null,
        source: "decision",
      });
    }

    // Model calls: service-role table, read only after the membership check above
    // and always filtered to this one workspace.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const calls = await supabaseAdmin
        .from("ai_usage_events")
        .select("id, created_at, provider, model, task, ok, latency_ms, error_category")
        .eq("organization_id", orgId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(data.limit);

      for (const row of calls.data ?? []) {
        const task = String(row.task ?? "");
        const { scope, label } = classify(task);
        entries.push({
          id: `c:${row.id}`,
          at: String(row.created_at),
          scope,
          label: `${label} — ${humanKind(task)}`,
          provider: String(row.provider ?? "") || null,
          model: String(row.model ?? "unknown"),
          ok: Boolean(row.ok),
          latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
          note: row.ok ? null : humanKind(String(row.error_category ?? "did not work")),
          source: "call",
        });
      }
    } catch {
      // A telemetry read failure must never hide the decisions above.
    }

    entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const trimmed = entries.slice(0, data.limit);

    const models = new Map<string, { model: string; provider: string | null; entries: number; failures: number }>();
    for (const entry of trimmed) {
      const key = `${entry.provider ?? ""}|${entry.model}`;
      const current =
        models.get(key) ?? { model: entry.model, provider: entry.provider, entries: 0, failures: 0 };
      current.entries += 1;
      if (!entry.ok) current.failures += 1;
      models.set(key, current);
    }

    return {
      entries: trimmed,
      byModel: [...models.values()].sort((a, b) => b.entries - a.entries),
      empty: trimmed.length === 0,
    };
  });
