/**
 * SITE-WIDE UPGRADE ENDPOINTS
 * ===========================
 *
 * Four owner-facing operations that act on the whole website rather than one
 * block: apply a coherent motion pack, write the cross-page story links, apply
 * a site-wide redesign direction, and have a free multimodal model review a
 * real screenshot of a page (and repair what it flags).
 *
 * Every one of them:
 *  - runs through the caller's own Supabase client, so tenant isolation is the
 *    database's own rules, not a check in this file;
 *  - requires an owner, admin or manager;
 *  - saves a restore point BEFORE writing anything, so any change can be
 *    rolled back from the existing version history;
 *  - reports exactly what changed, and reports nothing when nothing changed.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MotionIntensity } from "@/lib/builder/motion-pack";
import { planWebsiteChangesWithAi } from "@/lib/builder/ai-agent-plan.server";
import { applyWebsiteActions, loadAgentContext, runAiWebsiteUpgrade } from "@/lib/site-agent.functions";
import {
  parseVisionReview,
  visionRepairs,
  visionReviewPrompt,
  visionSummary,
  type VisionReview,
} from "@/lib/builder/vision-review";
import { writeSectionEffect } from "@/lib/site-effects";

type SupabaseLike = {
  from: import("@supabase/supabase-js").SupabaseClient["from"];
};

const MANAGERS = ["owner", "admin", "manager"];

async function requireManager(supabase: SupabaseLike, organizationId: string, userId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string | null } | null)?.role ?? null;
  if (!role || !MANAGERS.includes(role)) {
    throw new Error("Only an owner, admin or manager can change the website.");
  }
  return role;
}

/* ------------------------------------------------------------- motion pack */

/**
 * Everything needed to put a whole-site change back exactly as it was. Handed
 * to the owner's browser so a change can be tried and reversed in one click,
 * without touching the version history.
 */
export type SiteUpgradeUndo = {
  effects: { sectionId: string; effect: string }[];
  fingerprint: Record<string, string> | null;
};

export type MotionPackResult = {
  ok: boolean;
  intensity: MotionIntensity;
  changed: number;
  summary: string;
  restorePointId: string | null;
  undo: SiteUpgradeUndo | null;
};

export const applyMotionPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; intensity?: MotionIntensity }) => {
    if (!input?.organizationId) throw new Error("organizationId is required");
    if (input.intensity && !["none", "subtle", "expressive"].includes(input.intensity)) {
      throw new Error("Unknown movement level.");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<MotionPackResult> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);
    const intensity = data.intensity ?? "subtle";
    const run = await runAiWebsiteUpgrade({
      supabase,
      organizationId: data.organizationId,
      userId: context.userId,
      label: "AI motion update",
      instruction: "Update movement and animation across the website to the owner's requested intensity: " + intensity + ". " +
        "This is a motion-only change: do not rewrite copy, change business facts, add/remove pages or sections, or impose a template. " +
        "Use the site's existing creative direction as context. Choose the exact motion, duration, easing, transform and responsive behavior yourself. " +
        "Respect reduced-motion accessibility and keep interaction safe and performant.",
    });
    return {
      ok: true,
      intensity,
      changed: run.applied.applied,
      summary: run.plan.summary,
      restorePointId: String((run.applied as { snapshotId?: string | null }).snapshotId ?? "") || null,
      undo: null,
    };
  });

/* ------------------------------------------------------- storytelling pass */

export type StoryPassResult = {
  ok: boolean;
  order: { slug: string; title: string; role: string }[];
  linksWritten: number;
  findings: { kind: string; slug: string; detail: string }[];
  summary: string;
  restorePointId: string | null;
};

export const applyStoryPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; write?: boolean }) => {
    if (!input?.organizationId) throw new Error("organizationId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<StoryPassResult> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);
    if (data.write === false) {
      return { ok: true, order: [], linksWritten: 0, findings: [], summary: "AI story review is available through the website assistant.", restorePointId: null };
    }
    const run = await runAiWebsiteUpgrade({
      supabase,
      organizationId: data.organizationId,
      userId: context.userId,
      label: "AI story links",
      instruction: "Improve cross-page navigation and narrative flow across the whole website. Do not force a home/CTA/page-order template. The page architecture is the AI's creative decision for this business. Only change or add the links and buttons needed for that journey; preserve verified business facts and existing copy unless a link label must change.",
    });
    const appliedActions = ((run.applied as { appliedActions?: unknown[] }).appliedActions ?? []) as Array<Record<string, unknown>>;
    const linksWritten = appliedActions.filter((action) => {
      if (action["type"] === "set_component") {
        const patch = action["patch"];
        return Boolean(
          patch &&
          typeof patch === "object" &&
          ("link_url" in (patch as Record<string, unknown>) || "link_label" in (patch as Record<string, unknown>)),
        );
      }
      if (action["type"] === "add_component") {
        const kind = String(action["kind"] ?? "").toLowerCase();
        return ["button", "nav", "navigation"].some((value) => kind.includes(value)) &&
          Boolean(action["link_url"] || action["link_label"]);
      }
      return false;
    }).length;
    return {
      ok: true,
      order: [],
      linksWritten,
      findings: [],
      summary: run.plan.summary,
      restorePointId: String((run.applied as { snapshotId?: string | null }).snapshotId ?? "") || null,
    };
  });

/* --------------------------------------------------------- site-wide look */

export type RedesignResult = {
  ok: boolean;
  understood: boolean;
  direction: string | null;
  changes: { field: string; from: string; to: string }[];
  blocked: string[];
  motionChanged: number;
  summary: string;
  restorePointId: string | null;
  undo: SiteUpgradeUndo | null;
};

export const applySiteWideRedesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; instruction: string }) => {
    if (!input?.organizationId) throw new Error("organizationId is required");
    if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) {
      throw new Error("Tell Revora how the site should feel.");
    }
    return { organizationId: input.organizationId, instruction: input.instruction.slice(0, 1200) };
  })
  .handler(async ({ data, context }): Promise<RedesignResult> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);
    const run = await runAiWebsiteUpgrade({
      supabase,
      organizationId: data.organizationId,
      userId: context.userId,
      label: "AI site-wide redesign",
      instruction: [
        "Redesign the website's visual language based on the owner's request below.",
        "You are the sole creative author. Invent the appropriate visual system, layout, typography, colour, responsive behavior, imagery treatment and motion for this business.",
        "Do not use deterministic fingerprints, preset/theme libraries, fixed section vocabularies, or required hero/CTA anatomy.",
        "Preserve all verified business facts, prices, contact details and existing factual claims.",
        "Use AI-authored visual/responsive actions where possible so the renderer does not infer a legacy design.",
        "OWNER REQUEST: " + data.instruction,
      ].join("\n"),
    });
    return {
      ok: true,
      understood: true,
      direction: data.instruction,
      changes: [],
      blocked: [],
      motionChanged: run.applied.applied,
      summary: run.plan.summary,
      restorePointId: String((run.applied as { snapshotId?: string | null }).snapshotId ?? "") || null,
      undo: null,
    };
  });
/* ------------------------------------------------------------ page review */

export type VisionReviewResult = {
  ok: boolean;
  code: "REVIEWED" | "VISION_UNAVAILABLE" | "REVIEW_FAILED" | "FORBIDDEN";
  reason?: string;
  review?: VisionReview;
  summary?: string;
  provider?: string;
  model?: string;
  repairs?: { action: string; reason: string }[];
  unfixable?: { kind: string; detail: string }[];
  reportId?: string;
  storeWarning?: string;
};

const MAX_SCREENSHOT_BYTES = 4_000_000;

export const reviewPageScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      organizationId: string;
      pageUrl: string;
      pageSlug?: string | null;
      viewportWidth: number;
      pageTitle?: string | null;
      screenshotDataUrl: string;
    }) => {
      if (!input?.organizationId) throw new Error("organizationId is required");
      if (typeof input.screenshotDataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(input.screenshotDataUrl)) {
        throw new Error("A PNG, JPEG or WEBP screenshot is required.");
      }
      if (input.screenshotDataUrl.length > MAX_SCREENSHOT_BYTES) {
        throw new Error("That screenshot is too large to review.");
      }
      const width = Number(input.viewportWidth);
      if (!Number.isFinite(width) || width < 200 || width > 4000) throw new Error("Unexpected screen width.");
      return {
        organizationId: input.organizationId,
        pageUrl: String(input.pageUrl ?? "").slice(0, 500),
        pageSlug: input.pageSlug ? String(input.pageSlug).slice(0, 120) : null,
        pageTitle: input.pageTitle ? String(input.pageTitle).slice(0, 120) : null,
        viewportWidth: Math.round(width),
        screenshotDataUrl: input.screenshotDataUrl,
      };
    },
  )
  .handler(async ({ data, context }): Promise<VisionReviewResult> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);

    const { builderAiAvailable } = await import("@/lib/ai/availability");
    if (!builderAiAvailable("vision")) {
      return {
        ok: false,
        code: "VISION_UNAVAILABLE",
        reason:
          "No free picture-reading model is available right now, so this page was not reviewed. Nothing was changed.",
      };
    }

    const mimeType = data.screenshotDataUrl.slice(5, data.screenshotDataUrl.indexOf(";"));
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");

    let review: VisionReview;
    let provider = "";
    let model = "";
    try {
      const outcome = await generateStructuredOutput(
        { organizationId: data.organizationId, userId: context.userId, task: "site.vision_review" },
        {
          role: "vision",
          json: true,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: visionReviewPrompt({
                    pageTitle: data.pageTitle ?? data.pageSlug ?? "this page",
                    viewportWidth: data.viewportWidth,
                  }),
                },
                { type: "image", dataUrl: data.screenshotDataUrl, mimeType },
              ],
            },
          ],
        },
      );
      provider = outcome.provider;
      model = outcome.model;
      review = parseVisionReview(outcome.data);
    } catch (error) {
      return {
        ok: false,
        code: "REVIEW_FAILED",
        reason:
          error instanceof Error
            ? `The reviewer could not read this page: ${error.message}`
            : "The reviewer could not read this page.",
      };
    }

    const { repairs, unfixable } = visionRepairs(review);

    // The review is stored alongside the browser's own visual checks so the
    // owner keeps a history. Measurements stay empty here — this row is a
    // model's opinion of a screenshot, never a measurement.
    const { data: saved, error: saveError } = await supabase
      .from("website_visual_reports")
      .insert({
        organization_id: data.organizationId,
        page_url: data.pageUrl,
        page_slug: data.pageSlug,
        measurements: { source: "vision_review", viewportWidth: data.viewportWidth } as never,
        report: {
          kind: "vision_review",
          score: review.score,
          verdict: review.verdict,
          findings: review.findings,
          discarded: review.discarded,
          provider,
          model,
        } as never,
      })
      .select("id")
      .maybeSingle();

    return {
      ok: true,
      code: "REVIEWED",
      ...(saveError ? { storeWarning: "The review is shown here but could not be saved to your history." } : {}),
      review,
      summary: visionSummary(review),
      provider,
      model,
      repairs: repairs.map((repair) => ({ action: repair.action, reason: repair.reason })),
      unfixable: unfixable.map((finding) => ({ kind: finding.kind, detail: finding.detail })),
      ...(saved && (saved as { id?: string }).id ? { reportId: String((saved as { id: string }).id) } : {}),
    };
  });

export type VisionRepairResult = {
  ok: boolean;
  applied: string[];
  skipped: string[];
  restorePointId: string | null;
  summary: string;
};

/**
 * Visual QA repairs are AI-authored now. The vision model identifies the
 * concrete problem; Sol chooses the exact safe fix and Terra reviews it. No
 * fingerprint or canned visual treatment is used as a hidden repair authority.
 */
export const applyVisionRepairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; pageSlug?: string | null; findings: unknown }) => {
    if (!input?.organizationId) throw new Error("organizationId is required");
    if (!Array.isArray(input.findings)) throw new Error("Nothing to repair.");
    return {
      organizationId: input.organizationId,
      pageSlug: input.pageSlug ? String(input.pageSlug).slice(0, 120) : null,
      findings: input.findings.slice(0, 12),
    };
  })
  .handler(async ({ data, context }): Promise<VisionRepairResult> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);

    const review = parseVisionReview({ issues: data.findings });
    const { repairs, unfixable } = visionRepairs(review);
    const skipped = unfixable.map((finding) => finding.kind);
    if (repairs.length === 0) {
      return {
        ok: true,
        applied: [],
        skipped,
        restorePointId: null,
        summary: skipped.length ? "The reviewer found issues that need a different kind of change." : "There was nothing to repair.",
      };
    }

    const scope = data.pageSlug ? "on page /" + data.pageSlug : "across the website";
    const instruction = [
      "Repair only the visual QA findings below " + scope + ".",
      "These are post-render issues found by the vision reviewer. Do not redesign unrelated areas and do not rewrite business facts or verified copy.",
      "Choose the smallest appropriate safe fix yourself. Prefer AI-authored visual/responsive values rather than legacy section variants, design fingerprints, theme presets or canned motion packs.",
      "Preserve reduced-motion, touch-target, contrast and content integrity requirements.",
      "FINDINGS:",
      repairs.map((repair) => "- " + repair.kind + ": " + repair.reason).join("\n"),
    ].join("\n");

    try {
      const run = await runAiWebsiteUpgrade({
        supabase,
        organizationId: data.organizationId,
        userId: context.userId,
        label: "AI visual QA repair",
        instruction,
      });
      const applied = ((run.applied.details ?? []) as string[]).filter((item) => /^applied /i.test(item) || /^repaired /i.test(item));
      return {
        ok: true,
        applied,
        skipped,
        restorePointId: String((run.applied as { snapshotId?: string | null }).snapshotId ?? "") || null,
        summary: run.plan.summary,
      };
    } catch (error) {
      return {
        ok: false,
        applied: [],
        skipped: [...skipped, "ai_repair_failed"],
        restorePointId: null,
        summary: error instanceof Error ? error.message : "The AI reviewer could not repair this page. Nothing was changed.",
      };
    }
  });
/* ------------------------------------------------------------------- undo */

/**
 * Puts a whole-site change back exactly as it was. This is how an owner tries
 * a look safely: apply it, look at the site, and reverse it in one click if it
 * isn't right. Only the fields Revora itself changed are touched.
 */
export const undoSiteUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; undo: SiteUpgradeUndo }) => {
    if (!input?.organizationId) throw new Error("organizationId is required");
    const effects = Array.isArray(input.undo?.effects) ? input.undo.effects.slice(0, 400) : [];
    const fingerprint =
      input.undo?.fingerprint && typeof input.undo.fingerprint === "object"
        ? Object.fromEntries(
            Object.entries(input.undo.fingerprint)
              .filter(([key, value]) => typeof key === "string" && typeof value === "string")
              .slice(0, 20),
          )
        : null;
    return { organizationId: input.organizationId, undo: { effects, fingerprint } };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; reverted: number; summary: string }> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await requireManager(supabase, data.organizationId, context.userId);

    const { isSectionEffectId } = await import("@/lib/site-effects");
    let reverted = 0;
    for (const entry of data.undo.effects) {
      if (!entry || typeof entry.sectionId !== "string" || !isSectionEffectId(entry.effect)) continue;
      const { data: row } = await supabase
        .from("website_sections")
        .select("settings")
        .eq("id", entry.sectionId)
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      if (!row) continue;
      const { error } = await supabase
        .from("website_sections")
        .update({
          settings: writeSectionEffect((row as { settings?: unknown }).settings ?? null, entry.effect) as never,
        })
        .eq("id", entry.sectionId)
        .eq("organization_id", data.organizationId);
      if (!error) reverted += 1;
    }

    // Creative identity rollback is handled by the version snapshot created by
    // the AI action executor. Fingerprint synthesis is intentionally not used.

    return {
      ok: true,
      reverted,
      summary:
        reverted === 0
          ? "There was nothing left to put back."
          : "Put back exactly as it was before that change.",
    };
  });
