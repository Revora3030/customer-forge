/**
 * BUILD PROGRESS
 * ==============
 *
 * While Revora plans and applies a change, it records the step it is genuinely
 * on. The owner's browser reads those steps and shows them as they arrive, so a
 * long build reads as visible progress instead of a silent spinner.
 *
 * These rows are written by the server only (members can read them, nobody can
 * write them from the app) and they are cosmetic: a failure to record a step
 * must never affect the build.
 */

const MAX_STAGE = 60;
const MAX_DETAIL = 160;

/** The steps a build can report, in the order they normally happen. */
export const BUILD_STAGES = [
  "reading your business",
  "recalling your design identity",
  "planning the change",
  "checking the plan is safe",
  "saving a restore point",
  "writing the pages",
  "checking the result",
  "finishing up",
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number] | string;

function clean(value: string, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Records one step. Never throws and never delays the build — progress is a
 * courtesy to the owner, not part of the work.
 */
export async function recordStage(
  organizationId: string,
  runId: string,
  stage: BuildStage,
  detail?: string,
): Promise<void> {
  const cleanStage = clean(stage, MAX_STAGE);
  const cleanRun = clean(runId, 80);
  if (!organizationId || !cleanRun || !cleanStage) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("builder_progress").insert({
      organization_id: organizationId,
      run_id: cleanRun,
      stage: cleanStage,
      detail: detail ? clean(detail, MAX_DETAIL) : null,
    } as never);
  } catch {
    // Deliberately silent: a missing progress row is invisible to the owner
    // beyond a less detailed status line.
  }
}

/** Fire-and-forget form, for use inside a hot path. */
export function noteStage(
  organizationId: string,
  runId: string,
  stage: BuildStage,
  detail?: string,
): void {
  void recordStage(organizationId, runId, stage, detail);
}
