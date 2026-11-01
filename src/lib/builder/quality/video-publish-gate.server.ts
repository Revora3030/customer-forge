/**
 * Publish block, data part: scores the workspace's real website against the video bar. Server only.
 * Reads the site exactly as visitors will see it (`readWebsiteState`), the owner's own facts, and the trade blueprint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBlueprint } from "@/lib/builder/quality/blueprint-loader";
import { scoreVideoBar, VIDEO_BAR, type VideoScore } from "@/lib/builder/quality/video-score";
import { intakeFromWorkspace, themeFromProfile } from "@/lib/builder/quality/video-publish-gate";
import { siteModelFromSnapshot } from "@/lib/builder/quality/video-site-model";
import type { FullSnapshot } from "@/lib/site-restore";

export type WorkspaceVideoBar = {
  score: VideoScore;
  /** Score of the version that is live now. `null` when nothing has been published yet or it cannot be read. */
  previousScore: number | null;
  tradeSlug: string;
  blueprintSource: string;
};

export async function scoreWorkspaceVideoBar(supabase: SupabaseClient, orgId: string, options: { bar?: number; withPrevious?: boolean } = {}): Promise<WorkspaceVideoBar> {
  const { readWebsiteState } = await import("@/lib/site-restore.functions");
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [snapshot, org, profile, services, latest] = await Promise.all([
    readWebsiteState(supabase as never, orgId),
    db.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
    db.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db.from("services").select("name, description, price, starting_price").eq("organization_id", orgId).eq("is_active", true),
    options.withPrevious
      ? db.from("website_versions").select("pages").eq("organization_id", orgId).not("published_at", "is", null).order("version", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  for (const r of [org, profile, services]) if (r.error) throw new Error("Website quality could not be verified because a required database read failed. Try again before publishing.");

  const orgRow = (org.data ?? {}) as { name?: string; industry?: string | null };
  const profileRow = (profile.data ?? null) as Record<string, unknown> | null;
  const blueprint = loadBlueprint(orgRow.industry ?? null, String(profileRow?.["description"] ?? ""));
  const intake = intakeFromWorkspace({ businessName: orgRow.name, profile: profileRow, services: services.data ?? [] });
  const theme = themeFromProfile(profileRow);
  const bar = options.bar ?? VIDEO_BAR;
  const score = scoreVideoBar({ site: siteModelFromSnapshot(snapshot, theme), blueprint, intake }, bar);

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
