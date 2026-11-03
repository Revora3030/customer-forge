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
  "reading your message",
  "waiting for first website",
  "planning the change",
  "designing your change",
  "repairing the plan",
  "reviewing for safety",
  "revising after review",
  "polishing the design",
  "checking the plan is safe",
  "saving a restore point",
  "writing the pages",
  "generating your pictures",
  "planning your pages and making your pictures",
  "planning your pages",
  "designing your brand identity",
  "reading your services",
  "planning the page layout",
  "checking conversion paths",
  "checking the result",
  "finishing up",
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number] | string;

function clean(value: string, max: number): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex -- control characters are deliberately stripped from persisted progress text
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

    // Server-side dedupe: when the same stage is recorded for the same run
    // without additional detail, skip it. This prevents the progress card
    // from filling with dozens of identical "reading your message" rows when
    // a deferred request retries or a build step fires repeatedly.
    if (!detail) {
      const { data: existing } = await supabaseAdmin
        .from("builder_progress")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("run_id", cleanRun)
        .eq("stage", cleanStage)
        .is("detail", null)
        .limit(1);
      if (existing && existing.length > 0) return;
    }

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

/**
 * Live reply text for one request, written at most every ~600ms (plus a final
 * flush) so the owner sees the answer being written without a write per token.
 * Cosmetic: failures are ignored and never affect the plan.
 */
export function replyDraftWriter(organizationId: string, runId: string): (text: string) => void {
  const cleanRun = String(runId ?? "").trim().slice(0, 80);
  if (!organizationId || !cleanRun) return () => undefined;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = 0;
  const flush = async () => {
    timer = null;
    if (pending === null) return;
    const text = pending.slice(0, 4000);
    pending = null;
    lastAt = Date.now();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("builder_reply_drafts")
        .upsert({ organization_id: organizationId, run_id: cleanRun, text, updated_at: new Date().toISOString() });
    } catch {
      /* cosmetic */
    }
  };
  return (text: string) => {
    pending = text;
    if (timer) return;
    timer = setTimeout(() => void flush(), Math.max(0, 600 - (Date.now() - lastAt)));
  };
}
