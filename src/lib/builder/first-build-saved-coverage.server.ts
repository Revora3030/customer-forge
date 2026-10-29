import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/db/read-all";
import { firstBuildCoverageProblems, missingPictureProblems, readablePictureRepair, savedPictureRefs, type ExpectedBuildCoverage, type SavedBuildPage, type SavedBuildSection } from "./first-build-saved-coverage";

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
  // A composition's picture reference is the id of the COMPONENT that carries the
  // picture (the renderer resolves it against the section's components), not a
  // row of the media library. Checking only `media` called every picture of
  // every build "never saved": the 10-27 repair then stripped them all from the
  // finished site (a build that attached its pictures shipped none), and a
  // reference the repair could not strip failed the whole build at the end.
  // A reference is saved when a component with that id holds a picture, or the
  // media library holds that id.
  const savedIds = new Set<string>();
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    const [components, library] = await Promise.all([
      db.from("website_components").select("id, media_url").eq("organization_id", organizationId).in("id", chunk),
      db.from("media").select("id").eq("organization_id", organizationId).in("id", chunk),
    ]);
    if (components.error || library.error) throw new Error("Couldn't verify saved website pictures");
    for (const row of components.data ?? []) {
      const component = row as { id: string; media_url: string | null };
      if (typeof component.media_url === "string" && component.media_url.trim()) savedIds.add(component.id);
    }
    for (const row of library.data ?? []) savedIds.add((row as { id: string }).id);
  }
  const missing = new Set([...savedPictureRefs(savedSections).keys()].filter(ref => !savedIds.has(ref)));
  if (missing.size) {
    // Repair instead of failing the whole site: the section keeps its copy
    // without the unsaved picture; the readback below proves the result.
    for (const section of savedSections) {
      const repaired = readablePictureRepair(section.settings, missing);
      if (!repaired) continue;
      const { data, error } = await db.from("website_sections").update({ settings: repaired } as never).eq("organization_id", organizationId).eq("id", section.id).select("id");
      if (!error && Array.isArray(data) && data.length === 1) section.settings = repaired;
    }
  }
  problems.push(...missingPictureProblems(savedSections, savedIds));
  if (problems.length) {
    const { AiStepUnavailableError } = await import("./ai-step-error");
    throw new AiStepUnavailableError("saved website coverage", problems.slice(0, 12).join("; "));
  }
}