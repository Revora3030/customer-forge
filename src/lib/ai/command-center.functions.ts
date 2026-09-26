import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeDesignTokens, type DesignTokens } from "@/lib/builder/design-tokens";

type AnyDb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function superAdmin(context: { supabase: unknown; userId: unknown }) {
  const { assertSuperAdmin } = await import("@/lib/admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
}

const MODEL_ID = /^[\w@./:-]{2,120}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Settings, the models Revora can route to, and recent use — super admin only. */
export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await superAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyDb;
    const { toCommandSettings } = await import("@/lib/ai/command-settings.server");
    const { SPECIALIST_SIX } = await import("@/lib/ai/orchestration/specialists");
    const { candidateQuality } = await import("@/lib/ai/orchestration/order");
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [{ data: row }, { data: usage }, { data: orgs }] = await Promise.all([
      db.from("ai_command_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("ai_usage_events").select("model,provider,ok").gte("created_at", since).limit(5000),
      db.from("organizations").select("id,name,slug").order("created_at", { ascending: false }).limit(200),
    ]);
    const stats = new Map<string, { model: string; provider: string; calls: number; failures: number }>();
    for (const u of (usage ?? []) as { model: string | null; provider: string | null; ok: boolean | null }[]) {
      if (!u.model) continue;
      const s = stats.get(u.model) ?? { model: u.model, provider: u.provider ?? "", calls: 0, failures: 0 };
      s.calls += 1;
      if (u.ok === false) s.failures += 1;
      stats.set(u.model, s);
    }
    for (const s of SPECIALIST_SIX as readonly { model: string; provider?: string }[])
      if (!stats.has(s.model)) stats.set(s.model, { model: s.model, provider: s.provider ?? "", calls: 0, failures: 0 });
    const models = [...stats.values()]
      .map((s) => ({ ...s, quality: Math.round(candidateQuality(s.model)) }))
      .sort((a, b) => b.quality - a.quality || b.calls - a.calls);
    return {
      settings: toCommandSettings(row as Record<string, unknown> | null),
      models,
      orgs: (orgs ?? []) as { id: string; name: string; slug: string }[],
    };
  });

export const saveCommandSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pinnedModels: string[]; pausedModels: string[]; qaAutoRevert: boolean; qaMinScore: number }) => {
    const ids = (list: unknown) =>
      (Array.isArray(list) ? list : []).map(String).filter((m) => MODEL_ID.test(m)).slice(0, 20);
    const score = Number(input?.qaMinScore);
    return {
      pinnedModels: ids(input?.pinnedModels),
      pausedModels: ids(input?.pausedModels),
      qaAutoRevert: input?.qaAutoRevert === true,
      qaMinScore: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 70,
    };
  })
  .handler(async ({ data, context }) => {
    await superAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as AnyDb).from("ai_command_settings").upsert({
      id: 1,
      pinned_models: data.pinnedModels,
      paused_models: data.pausedModels.filter((m) => !data.pinnedModels.includes(m)),
      qa_auto_revert: data.qaAutoRevert,
      qa_min_score: data.qaMinScore,
      updated_at: new Date().toISOString(),
      updated_by: String(context.userId),
    });
    if (error) throw new Error("Couldn't save the AI settings.");
    const { clearCommandSettingsCache } = await import("@/lib/ai/command-settings.server");
    clearCommandSettingsCache();
    return { ok: true };
  });

/** The QA gate values are read through the trusted server after authentication. */
export const getQaGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as AnyDb)
      .from("ai_command_settings")
      .select("qa_auto_revert,qa_min_score")
      .eq("id", 1)
      .maybeSingle();
    const row = (data ?? {}) as { qa_auto_revert?: boolean; qa_min_score?: number };
    return { autoRevert: row.qa_auto_revert === true, minScore: row.qa_min_score ?? 70 };
  });

const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error("Invalid website.");
  return s;
};

export const getSiteDesign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => ({ organizationId: uuid(input?.organizationId) }))
  .handler(async ({ data, context }) => {
    await superAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyDb;
    const { readDesignTokens } = await import("@/lib/builder/design-tokens");
    const [{ data: profile }, { data: settings }] = await Promise.all([
      db.from("business_profiles").select("primary_color,secondary_color,accent_color,font_preference").eq("organization_id", data.organizationId).maybeSingle(),
      db.from("website_settings").select("generation").eq("organization_id", data.organizationId).maybeSingle(),
    ]);
    return {
      colors: (profile ?? {}) as { primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null },
      tokens: readDesignTokens((settings as { generation?: unknown } | null)?.generation ?? null) ?? {},
    };
  });

export const saveSiteDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; colors: Record<string, string>; tokens: DesignTokens }) => {
    const colors: Record<string, string> = {};
    for (const key of ["primary_color", "secondary_color", "accent_color"])
      if (HEX.test(String(input?.colors?.[key] ?? ""))) colors[key] = String(input.colors[key]);
    return { organizationId: uuid(input?.organizationId), colors, tokens: safeDesignTokens(input?.tokens) ?? {} };
  })
  .handler(async ({ data, context }) => {
    await superAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyDb;
    const { writeDesignTokens } = await import("@/lib/builder/design-tokens");
    const { data: settings } = await db.from("website_settings").select("generation").eq("organization_id", data.organizationId).maybeSingle();
    const generation = writeDesignTokens((settings as { generation?: unknown } | null)?.generation ?? null, data.tokens);
    const writes = [
      db.from("website_settings").upsert({ organization_id: data.organizationId, generation }, { onConflict: "organization_id" }),
    ];
    if (Object.keys(data.colors).length)
      writes.push(db.from("business_profiles").update(data.colors).eq("organization_id", data.organizationId));
    const results = await Promise.all(writes);
    if (results.some((r: { error?: unknown }) => r.error)) throw new Error("Couldn't save that design.");
    return { ok: true };
  });
