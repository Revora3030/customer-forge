/**
 * EDIT POLISH — every chat edit that lays out a section gets a light team
 * review (truthfulness, SEO, accessibility, phone layout). Sol revises from
 * the notes and Terra keeps only revisions that improve objective readiness.
 * The owner's requested change always happens; taste is left to Sol.
 * Any failure returns Sol's original proposal untouched.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { craftBarPrompt } from "@/lib/builder/world-class-craft";
import { validateComposition } from "@/lib/builder/composition-tree";
import { runReviewPanel } from "@/lib/builder/review-panel.server";
import { runImprovementGate, type GateReport } from "@/lib/builder/improvement-gate.server";

type RawAction = Record<string, unknown>;

/** Keep a record of every team decision so the owner of the platform can see it. */
export async function recordTeamReview(entry: { organizationId: string; kind: string; instruction: string | null; models: string[]; reports: GateReport[] }) {
  if (!entry.reports.length) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_generations").insert({
      organization_id: entry.organizationId,
      kind: entry.kind,
      model: entry.models.join("+").slice(0, 500) || "none",
      instruction: entry.instruction?.slice(0, 1000) ?? null,
      result: { gateReports: entry.reports } as never,
    });
    if (error) console.warn("team review not recorded", error.message);
  } catch (error) {
    console.warn("team review not recorded", (error as Error).message);
  }
}

export async function polishEditCompositions(input: {
  organizationId: string;
  instruction: string;
  actions: unknown;
}): Promise<{ actions: unknown; report: GateReport | null; models: string[] }> {
  if (!Array.isArray(input.actions)) return { actions: input.actions, report: null, models: [] };
  const actions = input.actions as RawAction[];
  const targets = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action?.["type"] === "set_composition" && typeof action["sectionId"] === "string" && validateComposition(action["tree"]).ok);
  if (!targets.length) return { actions: input.actions, report: null, models: [] };
  const current = Object.fromEntries(targets.map(({ action }) => [action["sectionId"] as string, action["tree"]]));
  const models: string[] = [];
  try {
    const panel = await runReviewPanel({
      organizationId: input.organizationId,
      mode: "light",
      material: ["OWNER REQUEST:", input.instruction, "", "PROPOSED SECTION LAYOUTS:", JSON.stringify(current)].join("\n"),
    });
    models.push(...panel.models);
    const notes = panel.notes.filter((n) => n.issues.length);
    if (!notes.length) return { actions: input.actions, report: null, models };
    const call = await callBestThinker({
      json: true,
      purpose: "creative_direction",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 12000,
      system: "You are Sol, lead art director. Improve your section layouts using the review notes where you agree. Keep the owner's requested change, keep every word, link and picture truthful, never downgrade. Use the same composition tree format. " + craftBarPrompt("polish"),
      user: ["OWNER REQUEST:", input.instruction, "", "YOUR LAYOUTS:", JSON.stringify(current), "", "REVIEW NOTES:", JSON.stringify(notes), "",
        'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}}'].join("\n"),
    });
    if (!call.ok) return { actions: input.actions, report: null, models };
    if (call.model) models.push(call.model);
    const start = call.text.indexOf("{");
    const end = call.text.lastIndexOf("}");
    const parsed = start >= 0 && end > start ? (JSON.parse(call.text.slice(start, end + 1)) as { sections?: Record<string, unknown> }) : {};
    const revised = parsed.sections ?? {};
    const proposed = Object.fromEntries(
      Object.entries(current).map(([id, tree]) => [id, validateComposition(revised[id]).ok ? revised[id] : tree]),
    );
    const gate = await runImprovementGate({
      organizationId: input.organizationId,
      context: `Owner request: ${input.instruction}`,
      current,
      proposed,
    });
    if (gate.model) models.push(gate.model);
    const { costMicrocents: _cost, ...report } = gate;
    await recordTeamReview({ organizationId: input.organizationId, kind: "edit_team_review", instruction: input.instruction, models, reports: [report] });
    if (!gate.accepted) return { actions: input.actions, report, models };
    const next = actions.map((action) =>
      action?.["type"] === "set_composition" && typeof action["sectionId"] === "string" && action["sectionId"] in proposed
        ? { ...action, tree: proposed[action["sectionId"]] }
        : action,
    );
    return { actions: next, report, models };
  } catch (error) {
    console.warn("edit polish skipped", (error as Error).message);
    return { actions: input.actions, report: null, models };
  }
}
