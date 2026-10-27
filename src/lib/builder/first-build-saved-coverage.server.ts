import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/db/read-all";
import { firstBuildCoverageProblems, missingPictureProblems, savedPictureRefs, type ExpectedBuildCoverage, type SavedBuildPage, type SavedBuildSection } from "./first-build-saved-coverage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read back tenant output before accepting first-site generation as finished. */
export async function assertFirstBuildSavedCoverage(
  db: SupabaseClient,
  organizationId: string,
  expected: ExpectedBuildCoverage,
): Promise<void> {
  const [pages, sections] = await Promise.all([
    readAll<SavedBuildPage>(() => db.from("website_pages").select("id,slug").eq("organization_id", organizationId).order("id")),
    readAll<SavedBuildSection>(() => db.from("website_sections").select("id,page_id,kind,settings").eq("organization_id", organizationId).order("id")),
  ]);
  if (pages.error || sections.error) throw new Error("Couldn't verify saved website coverage");
  const savedSections = (sections.data ?? []) as SavedBuildSection[];
  const problems = firstBuildCoverageProblems((pages.data ?? []) as SavedBuildPage[], savedSections, expected);
  const refs = [...savedPictureRefs(savedSections).keys()].filter(ref => UUID.test(ref));
  const savedIds = new Set<string>();
  for (let i = 0; i < refs.length; i += 100) {
    const { data, error } = await db.from("media").select("id").eq("organization_id", organizationId).in("id", refs.slice(i, i + 100));
    if (error) throw new Error("Couldn't verify saved website pictures");
    for (const row of data ?? []) savedIds.add((row as { id: string }).id);
  }
  problems.push(...missingPictureProblems(savedSections, savedIds));
  if (problems.length) {
    const { AiStepUnavailableError } = await import("./ai-step-error");
    throw new AiStepUnavailableError("saved website coverage", problems.slice(0, 12).join("; "));
  }
}