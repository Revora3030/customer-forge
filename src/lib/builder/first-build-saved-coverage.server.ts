import type { SupabaseClient } from "@supabase/supabase-js";
import { firstBuildCoverageProblems, type SavedBuildPage, type SavedBuildSection } from "./first-build-saved-coverage";

/** Read back tenant output before accepting first-site generation as finished. */
export async function assertFirstBuildSavedCoverage(
  db: SupabaseClient,
  organizationId: string,
  expected: { pages: number; sections: number },
): Promise<void> {
  const [pages, sections] = await Promise.all([
    db.from("website_pages").select("id,slug").eq("organization_id", organizationId),
    db.from("website_sections").select("id,page_id,kind,settings").eq("organization_id", organizationId),
  ]);
  if (pages.error || sections.error) throw new Error("Couldn't verify saved website coverage");
  const problems = firstBuildCoverageProblems(
    (pages.data ?? []) as SavedBuildPage[],
    (sections.data ?? []) as SavedBuildSection[],
    expected,
  );
  if (problems.length) {
    const { AiStepUnavailableError } = await import("./ai-step-error");
    throw new AiStepUnavailableError("saved website coverage", problems.slice(0, 12).join("; "));
  }
}