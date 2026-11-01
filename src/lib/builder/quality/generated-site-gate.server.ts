/**
 * Server side of the generator's video-bar gate: loads the generated site from the workspace and stores the result at
 * `website_settings.generation.videoGate` (re-reading first so no other build output is lost). Never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { gateGeneratedSite, type GeneratedSiteGateOutcome, type GeneratedSiteGateSummary } from "@/lib/builder/quality/generated-site-gate";

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function storeGeneratedSiteGate(db: Db, orgId: string, summary: GeneratedSiteGateSummary): Promise<void> {
  const { data, error } = await db.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This website has no settings yet.");
  const raw = (data as { generation?: unknown }).generation;
  const generation = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { error: saveError } = await db.from("website_settings").update({ generation: { ...generation, videoGate: summary } } as never).eq("organization_id", orgId);
  if (saveError) throw new Error(saveError.message);
}

export async function gateGeneratedWorkspaceSite(supabase: SupabaseClient, orgId: string, trigger = "build"): Promise<GeneratedSiteGateOutcome> {
  const { loadWorkspaceGateInput } = await import("@/lib/builder/quality/video-publish-gate.server");
  return gateGeneratedSite({
    trigger,
    load: () => loadWorkspaceGateInput(supabase, orgId),
    store: (summary) => storeGeneratedSiteGate(supabase as unknown as Db, orgId, summary),
    log: (m) => console.warn(`${m} [org ${orgId}]`),
  });
}
