/**
 * Live AI routing overrides from the admin Command Center. Cached briefly so
 * a model call never waits on the database, and a failed read never blocks AI.
 */
export type CommandSettings = {
  pinnedModels: string[];
  pausedModels: string[];
  qaAutoRevert: boolean;
  qaMinScore: number;
};

export const DEFAULT_COMMAND_SETTINGS: CommandSettings = {
  pinnedModels: [],
  pausedModels: [],
  qaAutoRevert: true,
  qaMinScore: 70,
};

let cache: { at: number; value: CommandSettings } | null = null;
const TTL_MS = 30_000;

export function toCommandSettings(row: Record<string, unknown> | null | undefined): CommandSettings {
  if (!row) return DEFAULT_COMMAND_SETTINGS;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    pinnedModels: list(row["pinned_models"]),
    pausedModels: list(row["paused_models"]),
    qaAutoRevert: row["qa_auto_revert"] !== false,
    qaMinScore: typeof row["qa_min_score"] === "number" ? row["qa_min_score"] : 70,
  };
}

export async function loadCommandSettings(): Promise<CommandSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("ai_command_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const value = toCommandSettings(data as Record<string, unknown> | null);
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.warn("[ai-command] settings unavailable, using defaults", error);
    return cache?.value ?? DEFAULT_COMMAND_SETTINGS;
  }
}

export function clearCommandSettingsCache() {
  cache = null;
}

/**
 * Applies admin overrides to an ordered candidate list: paused models are
 * removed (unless that would leave nothing to try), pinned models move first
 * in pin order. Pure — exported for tests.
 */
export function applyRoutingOverrides<T>(ordered: T[], modelOf: (entry: T) => string, settings: Pick<CommandSettings, "pinnedModels" | "pausedModels">): T[] {
  const paused = new Set(settings.pausedModels);
  const kept = ordered.filter((entry) => !paused.has(modelOf(entry)));
  const base = kept.length ? kept : ordered;
  const pinRank = new Map(settings.pinnedModels.map((model, i) => [model, i]));
  const pinned = base.filter((e) => pinRank.has(modelOf(e))).sort((a, b) => pinRank.get(modelOf(a))! - pinRank.get(modelOf(b))!);
  return [...pinned, ...base.filter((e) => !pinRank.has(modelOf(e)))];
}
