/**
 * Publish block, data part: scores the workspace's real website against the video bar. Server only.
 * Reads the site exactly as visitors will see it (`readWebsiteState`), the owner's own facts, and the trade blueprint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBlueprint, type LoadedBlueprint } from "@/lib/builder/quality/blueprint-loader";
import type { IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { scoreVideoBar, VIDEO_BAR, type VideoScore } from "@/lib/builder/quality/video-score";
import { intakeFromWorkspace, themeFromProfile } from "@/lib/builder/quality/video-publish-gate";
import { siteModelFromSnapshot, type SiteModel, type SiteTheme } from "@/lib/builder/quality/video-site-model";
import type { FullSnapshot } from "@/lib/site-restore";

export type WorkspaceVideoBar = {
  score: VideoScore;
  /** Score of the version that is live now. `null` when nothing has been published yet or it cannot be read. */
  previousScore: number | null;
  tradeSlug: string;
  blueprintSource: string;
};

/** What the video bar is scored on: the site as visitors will see it, the trade blueprint and the owner's own facts. */
export type WorkspaceGateInput = {
  site: SiteModel;
  blueprint: LoadedBlueprint;
  intake: IntakeFacts;
  theme: SiteTheme;
  tradeSlug: string;
  blueprintSource: string;
};

/** Reads everything the video bar needs for one workspace. Throws when a required read fails. */
export async function loadWorkspaceGateInput(supabase: SupabaseClient, orgId: string): Promise<WorkspaceGateInput> {
  const { readWebsiteState } = await import("@/lib/site-restore.functions");
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [snapshot, org, profile, services] = await Promise.all([
    readWebsiteState(supabase as never, orgId),
    db.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
    db.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db.from("services").select("name, description, price, starting_price").eq("organization_id", orgId).eq("is_active", true),
  ]);
  for (const r of [org, profile, services]) if (r.error) throw new Error("Website quality could not be verified because a required database read failed. Try again before publishing.");
  const orgRow = (org.data ?? {}) as { name?: string; industry?: string | null };
  const profileRow = (profile.data ?? null) as Record<string, unknown> | null;
  const blueprint = loadBlueprint(orgRow.industry ?? null, String(profileRow?.["description"] ?? ""));
  const intake = intakeFromWorkspace({ businessName: orgRow.name, profile: profileRow, services: services.data ?? [] });
  const theme = themeFromProfile(profileRow);
  return { site: siteModelFromSnapshot(snapshot, theme), blueprint, intake, theme, tradeSlug: blueprint.slug, blueprintSource: blueprint.source };
}

export async function scoreWorkspaceVideoBar(supabase: SupabaseClient, orgId: string, options: { bar?: number; withPrevious?: boolean } = {}): Promise<WorkspaceVideoBar> {
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [input, latest] = await Promise.all([
    loadWorkspaceGateInput(supabase, orgId),
    options.withPrevious
      ? db.from("website_versions").select("pages").eq("organization_id", orgId).not("published_at", "is", null).order("version", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { blueprint, intake, theme } = input;
  const bar = options.bar ?? VIDEO_BAR;
  const score = scoreVideoBar({ site: input.site, blueprint, intake }, bar);

  let previousScore: number | null = null;
  const live = (latest.data as { pages?: unknown } | null)?.pages as (FullSnapshot & { live_format?: number }) | undefined;
  if (live && Array.isArray(live.pages)) {
    try {
      previousScore = scoreVideoBar({ site: siteModelFromSnapshot(live, theme), blueprint, intake }, bar).score;
    } catch {
      previousScore = null;
    }
  }
  return { score, previousScore, tradeSlug: blueprint.slug, blueprintSource: blueprint.source };
}
