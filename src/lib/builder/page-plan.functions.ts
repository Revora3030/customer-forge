/**
 * CG-13 server path: read, edit, AI-revise one highlighted part of, approve and
 * restore the page plan. The plan lives in website_settings.generation.pagePlan
 * (no migration). The AI is only ever asked about the one part the owner
 * highlighted, and `applyScopedRevision` drops anything it changes elsewhere.
 * Nothing here starts a build.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PagePlan, PlanHistory } from "@/lib/builder/page-plan";

const orgSchema = z.object({ organizationId: z.string().uuid() });
const pageSchema = z.object({
  slug: z.string().max(60),
  title: z.string().max(80),
  purpose: z.string().max(400),
  points: z.array(z.string().max(300)).max(20),
});
const planSchema = z.object({ pages: z.array(pageSchema).min(1).max(30) });

export type PagePlanState = {
  /** What the owner is looking at: the newest saved version, else a draft from the brief. */
  plan: PagePlan | null;
  history: PlanHistory;
  /** True when `plan` is only a draft from the brief and not saved yet. */
  draft: boolean;
  approved: boolean;
  /** The brief the plan comes from is needed first. */
  needsBrief: boolean;
  /** A build is running, so the plan can't change now. */
  locked: boolean;
};

async function load(supabase: never, organizationId: string, userId: string, role: "manager" | "none") {
  const sb = supabase as import("@supabase/supabase-js").SupabaseClient;
  if (role === "manager") {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(sb as never, organizationId, userId, "manager");
    const { assertOrgEntitled } = await import("@/lib/entitlement.server");
    await assertOrgEntitled(sb as never, organizationId);
  }
  const { data, error } = await sb
    .from("website_settings")
    .select("generation")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const generation = ((data as { generation?: unknown } | null)?.generation ?? {}) as Record<string, unknown>;
  return { sb, generation };
}

const isLocked = (generation: Record<string, unknown>) =>
  generation["buildState"] === "materializing" || !!generation["pendingBuild"];

async function stateOf(generation: Record<string, unknown>): Promise<PagePlanState> {
  const { readHistory, latestVersion, isApproved, planFromBrief } = await import("@/lib/builder/page-plan");
  const { readBrief, INTENT_META } = await import("@/lib/site-brief");
  const history = readHistory(generation["pagePlan"]);
  const brief = readBrief(generation["brief"]);
  const latest = latestVersion(history);
  const plan =
    latest?.plan ??
    (brief ? planFromBrief(brief.pagePriorities, brief.intents.map((i) => INTENT_META[i].path)) : null);
  return {
    plan,
    history,
    draft: !latest && !!plan,
    approved: isApproved(history),
    needsBrief: !latest && !brief,
    locked: isLocked(generation),
  };
}

async function write(sb: import("@supabase/supabase-js").SupabaseClient, organizationId: string, generation: Record<string, unknown>, history: PlanHistory) {
  const { error } = await sb
    .from("website_settings")
    .upsert({ organization_id: organizationId, generation: { ...generation, pagePlan: history } } as never, {
      onConflict: "organization_id",
    });
  if (error) throw new Error(error.message);
}

/** Read-only: anyone in the workspace can see the plan. */
export const getPagePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgSchema.parse(input))
  .handler(async ({ data, context }): Promise<PagePlanState> => {
    const { generation } = await load(context.supabase as never, data.organizationId, String(context.userId), "none");
    return stateOf(generation);
  });

/** Saves the owner's edited plan as a new version, and optionally approves it to build from. */
export const savePagePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgSchema.extend({ plan: planSchema, approve: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }): Promise<PagePlanState> => {
    const { sb, generation } = await load(context.supabase as never, data.organizationId, String(context.userId), "manager");
    if (isLocked(generation)) throw new Error("Your website is being built right now. Change the plan once it finishes.");
    const { readPlan, readHistory, pushVersion, approveLatest } = await import("@/lib/builder/page-plan");
    const plan = readPlan(data.plan);
    if (!plan) throw new Error("The plan needs at least one page with a title.");
    let history = pushVersion(readHistory(generation["pagePlan"]), plan, "owner", "Edited by you", new Date().toISOString());
    if (data.approve) history = approveLatest(history);
    const next = { ...generation, pagePlan: history };
    await write(sb, data.organizationId, generation, history);
    return stateOf(next);
  });

/** Asks the AI to change ONE highlighted part. Saves the result as a new version. */
export const revisePlanPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    orgSchema
      .extend({
        slug: z.string().min(1).max(60),
        pointIndex: z.number().int().min(0).max(19).optional(),
        request: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PagePlanState & { ignoredOutsideEdits: number; changed: boolean }> => {
    const { sb, generation } = await load(context.supabase as never, data.organizationId, String(context.userId), "manager");
    if (isLocked(generation)) throw new Error("Your website is being built right now. Change the plan once it finishes.");
    const page = await import("@/lib/builder/page-plan");
    const current = await stateOf(generation);
    if (!current.plan) throw new Error("Analyse your business first so there is a plan to change.");
    if (!current.plan.pages.some((p) => p.slug === data.slug)) throw new Error("That page isn't in the plan.");

    const { readBrief } = await import("@/lib/site-brief");
    const brief = readBrief(generation["brief"]);
    const facts = brief
      ? JSON.stringify({ positioning: brief.positioning, buyer: brief.buyer, buyerGoal: brief.buyerGoal, primaryAction: brief.primaryAction })
      : "";
    const target = { slug: data.slug, ...(data.pointIndex === undefined ? {} : { pointIndex: data.pointIndex }) };
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    const result = await generateStructuredOutput(
      { organizationId: data.organizationId, userId: String(context.userId), task: "builder.plan_revise" },
      { role: "primary", maxOutputTokens: 2000, messages: page.planRevisionMessages(current.plan, target, data.request, facts) },
    );
    const { plan, changed, ignoredOutsideEdits } = page.applyScopedRevision(current.plan, target, result.data);
    if (!changed) return { ...current, changed: false, ignoredOutsideEdits };

    const note = `You asked: ${data.request}`.slice(0, 200);
    // An unsaved draft is saved first, so "what changed" compares against it.
    let history = current.history;
    if (current.draft) history = page.pushVersion(history, current.plan, "brief", "From your business brief", new Date().toISOString());
    history = page.pushVersion(history, plan, "ai", note, new Date().toISOString());
    await write(sb, data.organizationId, generation, history);
    return { ...(await stateOf({ ...generation, pagePlan: history })), changed: true, ignoredOutsideEdits };
  });

/** Going back makes a new version out of an old one. */
export const restorePagePlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgSchema.extend({ version: z.number().int().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<PagePlanState> => {
    const { sb, generation } = await load(context.supabase as never, data.organizationId, String(context.userId), "manager");
    if (isLocked(generation)) throw new Error("Your website is being built right now. Change the plan once it finishes.");
    const { readHistory, restoreVersion } = await import("@/lib/builder/page-plan");
    const history = restoreVersion(readHistory(generation["pagePlan"]), data.version, new Date().toISOString());
    await write(sb, data.organizationId, generation, history);
    return stateOf({ ...generation, pagePlan: history });
  });
