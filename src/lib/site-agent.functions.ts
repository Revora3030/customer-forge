import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Authenticated Site Agent endpoints.
 *
 * `planWebsiteChanges` reads the workspace's real site and returns a reviewable
 * plan. `applyWebsiteChanges` writes only the steps the client approved, after
 * snapshotting the current content so any change can be rolled back from version
 * history. Every query and write runs through the caller's own client, so RLS
 * keeps one client's website out of another's.
 */

import { writeBackdrop, writeSectionEffect } from "@/lib/site-effects";
import { writeComponentVisual, writeSectionVisual } from "@/lib/site-style";
import { writeCustomBlock } from "@/lib/builder/custom-block";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_ACTIONS,
  PLAN_INSTRUCTION_LIMIT,
  describeActions,
  readActions,
  readAttachments,
  type AgentAction,
  type AgentAttachment,
  type AgentStep,
  type AgentTurn,
  type SiteIndex,
} from "@/lib/site-agent";
import type { VerificationReport } from "@/lib/agent/verify";
import type { QaLoopResult } from "@/lib/builder/qa-loop.server";

import { safeLinkUrl } from "@/lib/website-content";
import {
  dropUnchangedActions,
  preflightActions,
  stalePlanMessage,
} from "@/lib/builder/apply-plan";
import {
  captureUndoFrom,
  loadUndoSnapshot,
  rollback,
  type JournalClient,
  type UndoStep,
} from "@/lib/site-agent.atomic";

/** A real database id, as opposed to a plan's temporary page name. */
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orgIdOf = (input: { organizationId?: unknown }) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
  return organizationId;
};

const str = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

type LoadedSite = {
  pages: {
    id: string;
    slug: string;
    title: string;
    kind: string;
    sort_order: number;
    is_visible: boolean;
    noindex: boolean;
    seo_title: string | null;
    seo_description: string | null;
  }[];
  sections: {
    id: string;
    page_id: string;
    kind: string;
    variant: string;
    heading: string | null;
    subheading: string | null;
    body: string | null;
    sort_order: number;
    is_visible: boolean;
  }[];
  components: {
    id: string;
    section_id: string;
    kind: string;
    label: string | null;
    body: string | null;
    link_label: string | null;
    link_url: string | null;
    sort_order: number;
    is_visible: boolean;
  }[];
};

async function loadSite(supabase: SupabaseLike, orgId: string): Promise<LoadedSite> {
  const [pages, sections, components] = await Promise.all([
    supabase
      .from("website_pages")
      .select("id, slug, title, kind, sort_order, is_visible, noindex, seo_title, seo_description")
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("website_sections")
      .select("id, page_id, kind, variant, heading, subheading, body, sort_order, is_visible")
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("website_components")
      .select("id, section_id, kind, label, body, link_label, link_url, sort_order, is_visible")
      .eq("organization_id", orgId)
      .order("sort_order"),
  ]);
  if (pages.error) throw new Error("You don't have access to that workspace.");
  if (sections.error || components.error) {
    console.error("[site-agent] website content could not be read", {
      sections: sections.error,
      components: components.error,
    });
    throw new Error(
      "Revora couldn't read your full website right now. Nothing was changed — please try again.",
    );
  }
  return {
    pages: (pages.data ?? []) as LoadedSite["pages"],
    sections: (sections.data ?? []) as LoadedSite["sections"],
    components: (components.data ?? []) as LoadedSite["components"],
  };
}

/** Minimal shape we use from the request-scoped Supabase client. */
type SupabaseLike = {
  from: SupabaseClient["from"];
};

/* --------------------------------- planning -------------------------------- */

/** Words that mean "change how the pages are put together", not just the paint. */
const COMPOSITION_WORDS = [
  "layout",
  "structure",
  "sections",
  "blocks",
  "order",
  "rearrange",
  "reorder",
  "redesign",
  "design",
  "look",
  "style",
  "rebuild",
  "compose",
  "restructure",
  "homepage",
  "home page",
];

function wantsComposition(instruction: string): boolean {
  const text = instruction.toLowerCase();
  return COMPOSITION_WORDS.some((word) => text.includes(word));
}

/** The owner's brand choices, read off the request before anything is composed. */
function readBrand(
  input: unknown,
): import("@/lib/builder/ai-composition.server").BrandPreference | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const hex = (value: unknown) =>
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
  const tone =
    record['tone'] === "light" || record['tone'] === "dark" || record['tone'] === "any"
      ? (record['tone'] as "light" | "dark" | "any")
      : null;
  const brand = {
    tone,
    primaryColor: hex(record['primaryColor']),
    secondaryColor: hex(record['secondaryColor']),
    accentColor: hex(record['accentColor']),
    font: typeof record['font'] === "string" ? str(record['font'], 60) || null : null,
    directionId: typeof record['directionId'] === "string" ? str(record['directionId'], 60) || null : null,
  };
  return Object.values(brand).some(Boolean) ? brand : null;
}

export const planWebsiteChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      organizationId: string;
      instruction: string;
      history?: { role: string; content: string }[];
      attachments?: unknown;
      brand?: unknown;
    }) => {
      const organizationId = orgIdOf(input);
      const instruction = str(input?.instruction, PLAN_INSTRUCTION_LIMIT);
      const attachments = readAttachments(input?.attachments);
      if (instruction.length < 3 && !attachments.length)
        throw new Error(
          "Tell Revora what you'd like changed — type it, say it, or attach a photo or clip.",
        );
      const history: AgentTurn[] = Array.isArray(input?.history)
        ? input.history
            .slice(-8)
            .map((turn) => ({
              role: turn?.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: str(turn?.content, 4000),
            }))
            .filter((turn) => turn.content.length > 0)
        : [];
      return { organizationId, instruction, history, attachments, brand: readBrand(input?.brand) };
    },
  )


  .handler(async ({ data, context }) =>
    planImpl(context.supabase as unknown as SupabaseLike, String(context.userId), data),
  );

type PlanInput = {
  organizationId: string;
  instruction: string;
  history: AgentTurn[];
  attachments: AgentAttachment[];
  brand?: import("@/lib/builder/ai-composition.server").BrandPreference | null;
};


async function planImpl(supabase: SupabaseLike, userId: string, data: PlanInput) {
  {
    const orgId = data.organizationId;

    // Visible progress for the owner. Cosmetic only — a failed write here can
    // never affect the build.
    const { noteStage } = await import("@/lib/builder/progress.server");
    const runId = crypto.randomUUID();
    noteStage(orgId, runId, "reading your business");

    const { planChanges } = await import("@/lib/site-agent.server");
    const { orchestrate } = await import("@/lib/agent/orchestrator.server");
    const { getWorkspaceContext, workspaceSummary } =
      await import("@/lib/agent/workspace-context.server");

    // The workspace picture is assembled once and reused for a short window, so
    // a follow-up message does not re-read the whole website to say the same
    // thing. Every write path clears it, so the agent never plans off stale data.
    const { context: agentContext } = await getWorkspaceContext(orgId, async () => {
      const { SECTION_LIBRARY, PAGE_LIBRARY } = await import("@/lib/website-content");
      const [site, org, profile, services, reviews, media] = await Promise.all([
        loadSite(supabase as unknown as SupabaseLike, orgId),
        supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
        supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase
          .from("services")
          .select("name, price, starting_price")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_published", true),
        supabase
          .from("media")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
      ]);
      if (!org.data) throw new Error("Workspace not found.");

      const p = (profile.data ?? {}) as Record<string, unknown>;
      const componentsBySection = new Map<string, LoadedSite["components"]>();
      for (const component of site.components) {
        const list = componentsBySection.get(component.section_id) ?? [];
        list.push(component);
        componentsBySection.set(component.section_id, list);
      }

      return {
        business: {
          name: org.data.name ?? "",
          industry: org.data.industry ?? null,
          tagline: (p["tagline"] as string) ?? null,
          description: (p["description"] as string) ?? null,
          city: (p["city"] as string) ?? null,
          state: (p["state"] as string) ?? null,
          serviceArea: (p["service_area"] as string) ?? null,
          phone: (p["phone"] as string) ?? null,
          email: (p["email"] as string) ?? null,
          yearsInBusiness: (p["years_in_business"] as number) ?? null,
          primaryColor: (p["primary_color"] as string) ?? null,
          secondaryColor: (p["secondary_color"] as string) ?? null,
          accentColor: (p["accent_color"] as string) ?? null,
          fontPreference: (p["font_preference"] as string) ?? null,
          services: (services.data ?? []).map((s) => ({
            name: s.name,
            price: s.price ?? null,
            startingPrice: s.starting_price ?? null,
          })),
          publishedReviewCount: reviews.count ?? 0,
          photoCount: media.count ?? 0,
        },
        pages: site.pages.map((page) => ({
          id: page.id,
          slug: page.slug,
          title: page.title,
          kind: page.kind,
          is_visible: page.is_visible,
          noindex: page.noindex,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          sections: site.sections
            .filter((section) => section.page_id === page.id)
            .map((section) => ({
              id: section.id,
              kind: section.kind,
              variant: section.variant,
              is_visible: section.is_visible,
              heading: section.heading,
              subheading: section.subheading,
              body: section.body,
              sort_order: section.sort_order,
              components: (componentsBySection.get(section.id) ?? []).map((component) => ({
                id: component.id,
                kind: component.kind,
                label: component.label,
                body: component.body,
                link_label: component.link_label,
                link_url: component.link_url,
                sort_order: component.sort_order,
              })),
            })),
        })),
        sectionKinds: SECTION_LIBRARY.map((s) => s.kind),
        pageKinds: PAGE_LIBRARY.map((p2) => p2.kind),
        componentKinds: [
          "feature",
          "faq",
          "step",
          "stat",
          "card",
          "link",
          "button",
          "quote",
          "list_item",
          "image",
        ],
      };
    });

    if (!agentContext.pages.length)
      throw new Error(
        "Build your website structure first — then the assistant can change anything on it.",
      );

    const instruction =
      data.instruction || "(see the attached file(s) — follow what they show or say)";

    // MEMORY ACROSS TURNS: standing instructions the owner already gave ("keep
    // the headline exactly as written", "stay on the coastal blue look") are
    // remembered for this website and read before anything is planned, so a
    // later request cannot quietly undo them. Only the owner's own words are
    // stored — never an invented preference and never a business fact.
    const { designMemoryBrief, mergeDesignMemory, readDesignMemory } = await import(
      "@/lib/builder/design-memory"
    );
    const settingsRow = await supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", orgId)
      .maybeSingle();
    const priorMemory = readDesignMemory(
      (settingsRow.data as { generation?: unknown } | null)?.generation,
    );
    const brief = designMemoryBrief(priorMemory);
    if (brief) data.history = [{ role: "user" as const, content: brief }, ...data.history];

    // LONG-SESSION MEMORY: the durable journal for this website — standing
    // rules, earlier requests, what was already done and what did not work — is
    // recalled before anything is planned, so the builder does not start from
    // scratch in a new session or repeat work it already finished. Guidance
    // only: the live website is still read and remains the source of truth, and
    // a recall failure simply means no brief.
    const { recallBrief } = await import("@/lib/builder/session-memory.server");
    const recall = await recallBrief(supabase as never, orgId);
    if (recall) data.history = [{ role: "user" as const, content: recall }, ...data.history];
    const nextMemory = mergeDesignMemory(priorMemory, data.instruction);

    // DESIGN IDENTITY. Worked out once from what the business actually is, then
    // reused on every later request so unrelated edits cannot quietly redesign
    // the site. Design choices only — never a business fact and never copy.
    const { createDesignFingerprint, fingerprintBrief, readDesignFingerprint, writeDesignFingerprint } =
      await import("@/lib/builder/design-fingerprint");
    const storedGeneration = ((settingsRow.data as { generation?: unknown } | null)?.generation ??
      {}) as Record<string, unknown>;
    noteStage(orgId, runId, "recalling your design identity");
    const priorFingerprint = readDesignFingerprint(storedGeneration);
    const fingerprint =
      priorFingerprint ??
      createDesignFingerprint({
        businessName: agentContext.business.name || null,
        industry: agentContext.business.industry ?? null,
        city: agentContext.business.city ?? null,
        audience: agentContext.business.serviceArea ?? null,
        goal: null,
        photoCount: agentContext.business.photoCount ?? 0,
        contentDensity: "balanced",
      });
    data.history = [{ role: "user" as const, content: fingerprintBrief(fingerprint) }, ...data.history];

    const memoryChanged = nextMemory !== priorMemory;
    const fingerprintNew = !priorFingerprint;
    if ((memoryChanged || fingerprintNew) && settingsRow.data) {
      let generation: Record<string, unknown> = { ...storedGeneration };
      if (memoryChanged) generation["designMemory"] = nextMemory;
      if (fingerprintNew) generation = writeDesignFingerprint(generation, fingerprint);
      const saved = await supabase
        .from("website_settings")
        .update({ generation: generation as never })
        .eq("organization_id", orgId);
      // A memory write must never block the build; it is only ever a preference.
      if (saved.error) console.warn("design memory not saved", saved.error.message);
    }

    // PAID MASTER ORCHESTRATOR (Luna). Luna never writes the website and is
    // never a worker: it reads the request plus the workspace's own facts and
    // returns a short coordination brief (what the owner is really asking for,
    // which specialists matter, what design intent must hold). The free model
    // workforce and the deterministic engine still do all the work. This starts
    // now and is awaited only after the native plan exists, so it cannot slow a
    // build down, and every failure path leaves the build untouched.
    const lunaOrchestration = (async (): Promise<string | null> => {
      try {
        const { callLuna } = await import("@/lib/ai/luna.server");
        const result = await callLuna({
          purpose: "intent",
          organizationId: orgId,
          maxOutputTokens: 500,
          system: [
            "You coordinate a website builder. You never write the website yourself.",
            "Reply with at most 6 short bullet lines of coordination guidance:",
            "what the owner is really asking for, which pages/sections it touches,",
            "and the design intent to hold. Never invent facts, prices, reviews,",
            "awards or results. Never rewrite wording the owner quoted exactly.",
          ].join(" "),
          user: [
            brief ? `Standing instructions: ${brief}` : "",
            `Business: ${agentContext.business?.name ?? "unnamed"} (${
              agentContext.business?.industry ?? "unknown industry"
            })`,
            `Pages: ${agentContext.pages.map((page) => page.title).join(", ")}`,
            `Request: ${instruction}`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (!result.ok) return null;
        return `Coordination brief from the master planner (guidance only, never a fact source):\n${result.text}`;
      } catch {
        // A coordination brief is an optional enhancement, never a dependency.
        return null;
      }
    })();



    // FREE-FIRST: Revora's own deterministic builder answers first. It uses the
    // trade playbooks, the section library, the design system and the
    // workspace's own facts — no AI provider, no credits, no per-request cost.
    // A language model is only consulted when the request needs judgement the
    // rules cannot supply, and if no provider is available the deterministic
    // plan is still returned, so the builder is never unusable.
    const { buildAutonomousPlan } = await import("@/lib/builder/autonomous-brain");
    // Uploads no longer sideline Revora's own builder: the structural work is
    // planned natively, and an outside model is only consulted when the upload's
    // contents genuinely have to be read before anything can change.
    const deterministic = buildAutonomousPlan(agentContext, instruction, {
      history: data.history
        .filter((turn) => turn.role === "user")
        .map((turn) => turn.content)
        .slice(-6),
      attachments: data.attachments.map((attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
      })),
    });

    let raw: Record<string, unknown>;
    let requirements: { label: string; covered: boolean }[] = [];
    let trace: string[] = [];
    const deterministicRaw = () => {
      if (!deterministic) return null;
      requirements = [...new Set(deterministic.intent.verbs)].map((verb) => ({
        label: verb,
        covered: true,
      }));
      trace = deterministic.trace;
      return {
        reply: deterministic.reply,
        summary: deterministic.summary,
        actions: deterministic.actions as unknown,
        questions: deterministic.questions,
        notes: deterministic.notes,
      } as Record<string, unknown>;
    };

    // The orchestrator's brief is collected only after Revora's own engine has
    // already planned, so a paid coordination call never delays the customer.
    // If it is off, capped, unreachable or slow, `lunaBrief` is simply absent
    // and everything downstream behaves exactly as before.
    const lunaBrief = await lunaOrchestration;
    if (lunaBrief) {
      data.history = [{ role: "user" as const, content: lunaBrief }, ...data.history];
    }



    const runAgent = async () => {
      noteStage(orgId, runId, "planning the change");
      const result = await orchestrate({
        context: agentContext,
        workspaceSummary: workspaceSummary(agentContext),
        instruction,
        history: data.history,
        attachments: data.attachments,
        plan: planChanges,
        caller: { organizationId: orgId, userId },
      });
      requirements = result.requirements;
      trace = result.trace;
      return result.raw;
    };
    const queued = (reason: string, retryable: boolean) => ({
      reply: retryable
        ? "Revora's writer is busy right now. Your request is saved — press Retry and it will pick up exactly where it left off."
        : "Revora's writer is paused for this workspace at the moment, so nothing was changed. Your request is saved and can be retried once it's available again.",
      summary: "",
      steps: [] as AgentStep[],
      questions: [] as string[],
      notes: [reason],
      requirements: [] as { label: string; covered: boolean }[],
      trace: [reason],
      unavailable: { reason, retryable, instruction } as {
        reason: string;
        retryable: boolean;
        instruction: string;
      } | null,
      composition:
        null as import("@/lib/builder/composition-preview").CompositionPreview | null,
    });

    // Revora's native engine is the primary brain: whenever it produced real,
    // validated website work it is used as-is. Only a request with nothing
    // recognisable in it — or an upload that has to be read — is escalated.
    // ZERO-COST MODE is Revora's default architecture, enforced on the server:
    // while it is on, no external model is contacted for a customer request —
    // not for attachments, not on an error, not on a retry. The native engine
    // answers, and a request it cannot place comes back as a plain question
    // rather than anything about providers, keys or credits.
    // FREE-AI-FIRST: the builder may use a provider whose configured usage is
    // actually free (Cloudflare Workers AI, OpenRouter free models, the Gemini
    // free tier). Paid provider accounts stay unreachable unless an operator
    // explicitly opted out of both zero-cost and free-only mode, so customer
    // website building never needs a paid plan. With no free provider reachable,
    // the native engine answers exactly as before.
    const { builderAiAvailable } = await import("@/lib/ai/availability");
    const zeroCost = !builderAiAvailable();

    // DESIGN UNIQUENESS: for a whole-site redesign, a free provider composes the
    // section mix, page order and visual direction for THIS business before the
    // deterministic plan is applied on top. Structure only — it writes no copy
    // and states no fact — and any failure leaves the deterministic plan alone.
    let composed: Awaited<
      ReturnType<typeof import("@/lib/builder/ai-composition.server").proposeSiteComposition>
    > = null;
    // The agency sits on every substantial request now, not only a whole-site
    // redesign: any request that is not a tiny literal edit gets the full free
    // pool composing structure and look-and-feel. A one-word or one-colour fix
    // stays deterministic and instant, and the owner's saved brand still wins
    // unless they actually asked for a new look (see brand-lock).
    const { ensembleModeFor } = await import("@/lib/ai/ensemble.server");
    const composeWanted =
      deterministic.intent.wholeSite ||
      wantsComposition(instruction) ||
      ensembleModeFor(instruction) !== "minimal";
    if (composeWanted && !zeroCost) {
      const { proposeSiteComposition } = await import("@/lib/builder/ai-composition.server");
      composed = await proposeSiteComposition(agentContext, {
        instruction,
        organizationId: orgId,
        userId,
        brand: data.brand ?? null,
      });
    }


    if (deterministic.actions.length && !deterministic.requiresExternalReasoning) {
      // Handled entirely by Revora's own rules unless a composition was proposed.
      raw = deterministicRaw()!;
      if (composed) {
        raw['actions'] = [
          ...composed.actions,
          ...deterministic.actions,
        ] as unknown;
        trace = [
          ...trace,
          `Layout composed for this business: ${composed.because}`,
          ...composed.notes,
        ];
      }
    
    } else if (zeroCost) {
      if (deterministic.actions.length) {
        raw = deterministicRaw()!;
        trace = [
          ...deterministic.trace,
          "Built with Revora's own engine — no outside AI involved.",
        ];
      } else {
        // The request was too vague to place directly. Rather than answering
        // with a question, Revora reads the real site map and does the single
        // most valuable thing it can see, and says plainly why it chose it.
        const { resolveVagueIntent } = await import("@/lib/builder/intent-resolution");
        const resolved = resolveVagueIntent(agentContext);
        const retry = resolved
          ? buildAutonomousPlan(agentContext, resolved.instruction, {
              history: data.history
                .filter((turn) => turn.role === "user")
                .map((turn) => turn.content)
                .slice(-6),
              attachments: data.attachments.map((attachment) => ({
                kind: attachment.kind,
                name: attachment.name,
              })),
            })
          : null;

        if (resolved && retry?.actions.length) {
          requirements = [...new Set(retry.intent.verbs)].map((verb) => ({
            label: verb,
            covered: true,
          }));
          trace = [
            ...retry.trace,
            `You weren't specific, so Revora chose this: ${resolved.because}.`,
            "Built with Revora's own engine — no outside AI involved.",
          ];
          raw = {
            reply: `I wasn't sure which part you meant, so I went with the biggest win — ${resolved.because}. Here's the plan.`,
            summary: retry.summary,
            actions: retry.actions as unknown,
            questions: retry.questions,
            notes: retry.notes,
          } as Record<string, unknown>;
        } else {
          return {
            reply:
              "I want to get this right rather than guess. Tell me which part of your website you'd like changed — for example the top of the home page, your services, your prices, or how it looks — and I'll do it.",
            summary: "",
            steps: [] as AgentStep[],
            questions: deterministic.questions.length
              ? deterministic.questions
              : ["Which part of your website should I change?"],
            notes: deterministic.notes,
            requirements: [] as { label: string; covered: boolean }[],
            trace: [...deterministic.trace, "Nothing changed — waiting on one detail."],
            unavailable: null,
            composition:
              null as import("@/lib/builder/composition-preview").CompositionPreview | null,
          };
        }
      }
    } else {
      let attempt = 0;
      for (;;) {
        attempt += 1;
        try {
          raw = await runAgent();
          break;
        } catch (error) {
          const status = (error as { status?: number } | null)?.status;
          if ((status === 429 || status === 503) && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            continue;
          }
          const transient = status === 429 || status === 503 || status === 500 || status === 502;
          if (transient && status !== 429 && status !== 503 && attempt < 2) continue;
          // Optional help was unavailable. Revora still builds: the
          // deterministic plan is used whenever it produced real work, and only
          // a request with nothing to act on comes back as retryable.
          const fallback = deterministic?.actions.length ? deterministicRaw() : null;
          if (fallback) {
            raw = fallback;
            trace = [
              ...deterministic!.trace,
              "Built this with Revora's own builder — no outside AI was needed.",
            ];
            break;
          }
          if (transient) return queued("The AI writer could not be reached", true);
          if (status === 402 || status === 403)
            return queued("The AI writer is paused for this workspace", false);
          throw error;
        }
      }
    }

    const allSections = agentContext.pages.flatMap((page) =>
      page.sections.map((section) => ({ ...section, pageId: page.id })),
    );
    const actions = readActions(raw["actions"], {
      pageIds: new Set(agentContext.pages.map((page) => page.id)),
      sectionIds: new Set(allSections.map((section) => section.id)),
      componentIds: new Set(
        allSections.flatMap((section) => section.components.map((component) => component.id)),
      ),
    });
    const index: SiteIndex = { pages: new Map(), sections: new Map(), components: new Map() };
    const currentText = new Map<string, string>();
    for (const page of agentContext.pages)
      index.pages.set(page.id, { title: page.title, slug: page.slug });
    for (const section of allSections) {
      index.sections.set(section.id, {
        pageId: section.pageId,
        label: section.heading?.slice(0, 40) || section.kind.replace(/_/g, " "),
      });
      currentText.set(`${section.id}:heading`, section.heading ?? "");
      currentText.set(`${section.id}:subheading`, section.subheading ?? "");
      currentText.set(`${section.id}:body`, section.body ?? "");
      for (const component of section.components)
        index.components.set(component.id, {
          sectionId: section.id,
          label: component.label?.slice(0, 40) || component.kind.replace(/_/g, " "),
        });
    }
    const steps = describeActions(actions, index, currentText);

    const list = (value: unknown) =>
      Array.isArray(value)
        ? value
            .map((item) => str(item, 300))
            .filter(Boolean)
            .slice(0, 8)
        : [];

    const plan = {
      reply: str(raw["reply"], 1500) || "Here's what I'll change.",
      summary: str(raw["summary"], 300),
      steps,
      questions: list(raw["questions"]).slice(0, 3),
      notes: list(raw["notes"]),
      // What the agent understood it had to satisfy, and whether it did.
      requirements: requirements.slice(0, 8),
      // What the agent actually did to get here, stage by stage.
      trace: trace.slice(0, 8),
      unavailable: null as { reason: string; retryable: boolean; instruction: string } | null,
      // The look and page blocks the AI chose, with its reasoning, so the owner
      // can preview, approve or adjust before anything is applied.
      composition: (composed
        ? composed.preview
        : null) as import("@/lib/builder/composition-preview").CompositionPreview | null,
    };


    await supabase.from("ai_generations").insert({
      organization_id: orgId,
      kind: "agent_plan",
      model: "revora-ai",
      instruction:
        data.instruction.slice(0, 4000) +
        (data.attachments.length
          ? `\n[attached: ${data.attachments.map((a) => `${a.kind} ${a.name}`).join(", ")}]`
          : ""),
      result: plan as unknown as never,
      created_by: userId,
    });

    return plan;
  }
}

export type WebsitePlan = Awaited<ReturnType<typeof planImpl>>;

/* --------------------------------- applying -------------------------------- */

export const applyWebsiteChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      organizationId: string;
      actions: unknown;
      label?: string;
      verify?: boolean;
      operationKey?: string;
    }) => ({
      organizationId: orgIdOf(input),
      actions: input?.actions,
      label: str(input?.label, 120),
      verify: input?.verify !== false,
      operationKey: str(input?.operationKey, 80),
    }),
  )
  .handler(async ({ data, context }) =>
    applyImpl(context.supabase as unknown as SupabaseLike, String(context.userId), data),
  );

type ApplyInput = {
  organizationId: string;
  actions: unknown;
  label: string;
  verify?: boolean | undefined;
  /** Stable per-request key so a double press cannot write the batch twice. */
  operationKey?: string | undefined;
};

/** Accepts any id, so a batch can be read exactly as it was planned. */
const ANY_ID = { has: () => true } as unknown as Set<string>;

async function applyImpl(supabase: SupabaseLike, userId: string, data: ApplyInput) {
  {
    const orgId = data.organizationId;
    const { noteStage: noteApplyStage } = await import("@/lib/builder/progress.server");
    const applyRunId = crypto.randomUUID();
    noteApplyStage(orgId, applyRunId, "checking the plan is safe");
    // One id for this whole apply. Every row it touches, the restore point it
    // took, and any rollback it had to run are all recorded against this id, so
    // a change is always traceable as a single operation rather than a scatter
    // of unrelated edits.
    const operationId = crypto.randomUUID();

    // Writing invalidates the agent's cached picture of this workspace, so the
    // next plan is made against the site as it now really is.
    const { invalidateWorkspaceContext } = await import("@/lib/agent/workspace-context.server");
    invalidateWorkspaceContext(orgId);

    // Idempotency: the same request key applied moments ago is answered with the
    // result of that run instead of writing everything a second time. This is
    // what stops a double press, an impatient retry or a reconnect from
    // duplicating sections.
    if (data.operationKey) {
      const { data: recent } = await supabase
        .from("ai_generations")
        .select("result, created_at")
        .eq("organization_id", orgId)
        .eq("kind", "agent_apply")
        .order("created_at", { ascending: false })
        .limit(20);
      const cutoff = Date.now() - 15 * 60 * 1000;
      const previous = (recent ?? []).find((row) => {
        const result = row?.["result"] as { operationKey?: unknown } | null;
        const at = Date.parse(String(row?.["created_at"] ?? ""));
        return result?.operationKey === data.operationKey && Number.isFinite(at) && at >= cutoff;
      });
      if (previous) {
        const result = previous["result"] as Record<string, unknown>;
        const labels = (key: string) =>
          Array.isArray(result[key]) ? (result[key] as unknown[]).map((item) => String(item)) : [];
        return {
          applied: Number(result["applied"] ?? 0) || 0,
          failed: Number(result["failed"] ?? 0) || 0,
          stale: Number(result["stale"] ?? 0) || 0,
          staleNotice: String(result["staleNotice"] ?? ""),
          duplicates: Number(result["duplicates"] ?? 0) || 0,
          details: [
            ...labels("appliedLabels").map((label) => `applied ${label}`),
            ...labels("skippedLabels").map((label) => `skipped ${label}`),
          ],
          snapshotLabel: String(result["snapshotLabel"] ?? ""),
          snapshotVersion: Number(result["snapshotVersion"] ?? 0) || 0,
          operationId: String(result["operationId"] ?? ""),
          alreadyApplied: true,
          verification: null as VerificationReport | null,
        };
      }
    }

    const site = await loadSite(supabase as unknown as SupabaseLike, orgId);
    // Read the batch exactly as planned, then check it against the site as it is
    // right now. A step whose target was deleted or renamed after planning is
    // reported with a reason rather than being dropped in silence.
    const planned = readActions(data.actions, {
      pageIds: ANY_ID,
      sectionIds: ANY_ID,
      componentIds: ANY_ID,
    });
    const preflight = preflightActions(planned, {
      pageIds: new Set(site.pages.map((page) => page.id)),
      sectionIds: new Set(site.sections.map((section) => section.id)),
      componentIds: new Set(site.components.map((component) => component.id)),
    });
    // A step whose result is already true of the site is not a change. Dropping
    // those here is what keeps the reported numbers honest: the owner is told how
    // many things actually changed, not how many rows were written over.
    const settled = dropUnchangedActions(
      preflight.ok,
      new Map(site.sections.map((section) => [section.id, section])),
    );
    const actions = settled.actions;
    const staleNotice = stalePlanMessage(preflight.stale, planned.length);
    if (actions.length > MAX_ACTIONS) {
      throw new Error(
        `That batch contains ${actions.length} supported changes, but Revora can safely install up to ${MAX_ACTIONS} at once. Untick a few upgrades, install those first, then continue with the rest.`,
      );
    }
    if (!actions.length) {
      if (preflight.stale.length) throw new Error(staleNotice);
      if (settled.unchanged) {
        throw new Error(
          "Your website already matches that, so there was nothing to change. Nothing was touched.",
        );
      }
      throw new Error("Nothing to apply.");
    }

    // Fail before taking a restore point when a generated batch would collide
    // with an existing page slug or create the same slug twice.
    const plannedSlugs = new Set(
      site.pages.map((page) => page.slug.replace(/^\/+|\/+$/g, "").toLowerCase()),
    );
    for (const action of actions) {
      if (action.type !== "add_page") continue;
      const slug = action.slug.replace(/^\/+|\/+$/g, "").toLowerCase();
      if (plannedSlugs.has(slug)) {
        throw new Error(
          `Revora stopped before changing your site because the plan would create a duplicate page address: /${slug || "(home)"}.`,
        );
      }
      plannedSlugs.add(slug);
    }

    noteApplyStage(orgId, applyRunId, "saving a restore point");
    // Snapshot first, so an unwanted change can always be rolled back.
    const snapshotLabel = data.label || "Before assistant changes";
    const { snapshotContent } = await import("@/lib/website-content");
    const [{ data: latest }, contentTree] = await Promise.all([
      supabase
        .from("website_versions")
        .select("version")
        .eq("organization_id", orgId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      Promise.resolve(
        site.pages.map((page) => ({
          ...page,
          seo_canonical: null,
          og_title: null,
          og_description: null,
          og_image_url: null,
          sections: site.sections
            .filter((section) => section.page_id === page.id)
            .map((section) => ({
              ...section,
              settings: {},
              components: site.components
                .filter((component) => component.section_id === section.id)
                .map((component) => ({ ...component, media_url: null, settings: {} })),
            })),
        })),
      ),
    ]);
    // The restore point must exist BEFORE anything is written, and it must be
    // verified — a failed snapshot insert used to be ignored, which meant a
    // change could be applied with nothing to go back to. Two members applying
    // at the same moment can collide on the version number, so the insert is
    // retried on the next free version.
    const snapshotPages = snapshotContent(contentTree as never) as unknown as never;
    let snapshotVersion = Number(latest?.version ?? 0);
    let snapshotId: string | null = null;
    let snapshotError: unknown = null;
    for (let attempt = 0; attempt < 5 && !snapshotId; attempt += 1) {
      snapshotVersion += 1;
      const { data: saved, error } = await supabase
        .from("website_versions")
        .insert({
          organization_id: orgId,
          version: snapshotVersion,
          label: snapshotLabel,
          pages: snapshotPages,
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (saved?.id) snapshotId = String(saved.id);
      else snapshotError = error;
    }
    if (!snapshotId) {
      console.error("[site-agent] restore point could not be saved", snapshotError);
      throw new Error(
        "Revora couldn't save a restore point for your website, so nothing was changed. Please try again in a moment.",
      );
    }

    noteApplyStage(orgId, applyRunId, "writing the pages");
    const sortOf = new Map(site.sections.map((section) => [section.id, section.sort_order]));
    const applied: string[] = [];
    const failed: string[] = [];

    // Every write records how to reverse itself first. The first failure stops
    // the run and reverses everything already applied, so an approved plan is
    // either fully in place or the site is exactly as it was.
    const undoSteps: UndoStep[] = [];
    let fatal: unknown = null;

    // SPEED: the pre-write state of everything this batch touches is read once,
    // here, instead of once per step. The writes themselves stay strictly in
    // order — that ordering is what makes a failed batch reversible — but a large
    // build no longer pays a database round trip just to look at a row it is
    // about to change.
    const undoSnapshot = await loadUndoSnapshot(
      supabase as unknown as JournalClient,
      orgId,
      actions as AgentAction[],
    );

    // Steps that change part of a JSON column (a section's look, a custom block,
    // a backdrop) need the column's current value. It comes from the snapshot,
    // and every write records its new value here so a second step touching the
    // same row in the same batch still builds on the first one.
    const overlay = new Map<string, Record<string, unknown>>();
    const rowKey = (table: string, id: string | null) => `${table}:${id ?? "org"}`;
    const readColumn = (table: string, id: string | null, column: string): unknown => {
      const patched = overlay.get(rowKey(table, id));
      if (patched && column in patched) return patched[column] ?? null;
      const row = id
        ? undoSnapshot.rows.get(table)?.get(id)
        : (undoSnapshot.orgRows.get(table) ?? null);
      return row ? (row[column] ?? null) : null;
    };
    const noteColumn = (table: string, id: string | null, column: string, value: unknown) => {
      const key = rowKey(table, id);
      overlay.set(key, { ...(overlay.get(key) ?? {}), [column]: value });
    };

    const run = async (label: string, work: () => PromiseLike<unknown>) => {
      if (fatal) return;
      try {
        const result = (await work()) as { error?: unknown } | null;
        if (result && result.error) throw result.error;
        applied.push(label);
      } catch (error) {
        console.error("[site-agent] action failed", label, error);
        failed.push(label);
        fatal = error;
      }
    };

    // A plan may create a page and then fill it in the same run. The new page's
    // temporary name is swapped for its real id as soon as the row exists, so
    // later steps land on it instead of being dropped.
    const newPages = new Map<string, string>();
    // Same idea for sections: a section created in this run can be filled with
    // buttons and cards straight away.
    const newSections = new Map<string, string>();
    // Components get temporary references too, allowing one plan to create
    // and then refine a button/card/image without another round trip.
    const newComponents = new Map<string, string>();

    const nextSectionSort = new Map<string, number>();
    for (const section of site.sections) {
      nextSectionSort.set(
        section.page_id,
        Math.max(nextSectionSort.get(section.page_id) ?? 0, Number(section.sort_order) + 1),
      );
    }

    const nextComponentSort = new Map<string, number>();
    for (const component of site.components) {
      nextComponentSort.set(
        component.section_id,
        Math.max(
          nextComponentSort.get(component.section_id) ?? 0,
          Number(component.sort_order) + 1,
        ),
      );
    }

    // Parent maps make reorder operations tenant-safe and section-safe even
    // when a generated plan contains IDs from multiple parts of the site.
    const sectionPage = new Map(site.sections.map((section) => [section.id, section.page_id]));
    const componentSection = new Map(
      site.components.map((component) => [component.id, component.section_id]),
    );

    for (const rawAction of actions as AgentAction[]) {
      if (fatal) break;
      let resolved: AgentAction = rawAction;
      if ("pageId" in resolved && newPages.has(resolved.pageId))
        resolved = { ...resolved, pageId: newPages.get(resolved.pageId)! } as AgentAction;
      if ("sectionId" in resolved && newSections.has(resolved.sectionId))
        resolved = { ...resolved, sectionId: newSections.get(resolved.sectionId)! } as AgentAction;
      if (resolved.type === "reorder_sections") {
        resolved = {
          ...resolved,
          sectionIds: resolved.sectionIds.map(
            (sectionId) => newSections.get(sectionId) ?? sectionId,
          ),
        };
      }
      if (resolved.type === "reorder_components") {
        resolved = {
          ...resolved,
          componentIds: resolved.componentIds.map(
            (componentId) => newComponents.get(componentId) ?? componentId,
          ),
        };
      }
      if ("componentId" in resolved && newComponents.has(resolved.componentId))
        resolved = {
          ...resolved,
          componentId: newComponents.get(resolved.componentId)!,
        } as AgentAction;
      const action = resolved;

      if (action.type === "reorder_sections") {
        const wrongPage = action.sectionIds.find((id) => sectionPage.get(id) !== action.pageId);
        if (wrongPage) {
          fatal = new Error("A section reorder tried to cross page boundaries.");
          failed.push("reorder_sections:cross_page_target");
          break;
        }
      }
      if (action.type === "reorder_components") {
        const wrongSection = action.componentIds.find(
          (id) => componentSection.get(id) !== action.sectionId,
        );
        if (wrongSection) {
          fatal = new Error("A component reorder tried to cross section boundaries.");
          failed.push("reorder_components:cross_section_target");
          break;
        }
      }

      // A step that still points at a section which was never created is
      // skipped rather than written against a made-up id.

      if ("sectionId" in action && !UUID_ID.test(action.sectionId)) {
        failed.push(`${action.type}:unresolved_section`);
        continue;
      }
      // A step that still points at a page which was never created is skipped
      // rather than written against a made-up id.
      if ("pageId" in action && !UUID_ID.test(action.pageId)) {
        failed.push(`${action.type}:unresolved_page`);
        continue;
      }
      try {
        undoSteps.push(
          ...captureUndoFrom(supabase as unknown as JournalClient, orgId, action, undoSnapshot),
        );
      } catch (error) {
        console.error("[site-agent] could not record an undo step", action.type, error);
        fatal = error;
        break;
      }
      switch (action.type) {
        case "set_section_text":
          await run(action.type, () =>
            supabase
              .from("website_sections")
              .update({ [action.field]: action.value } as never)
              .eq("id", action.sectionId)
              .eq("organization_id", orgId),
          );
          break;
        case "set_section_visibility":
          await run(action.type, () =>
            supabase
              .from("website_sections")
              .update({ is_visible: action.visible })
              .eq("id", action.sectionId)
              .eq("organization_id", orgId),
          );
          break;
        case "set_section_variant":
          await run(action.type, () =>
            supabase
              .from("website_sections")
              .update({ variant: action.variant })
              .eq("id", action.sectionId)
              .eq("organization_id", orgId),
          );
          break;
        case "set_section_visual":
          await run(action.type, () => {
            const settings = writeSectionVisual(
              readColumn("website_sections", action.sectionId, "settings"),
              action.patch,
            );
            noteColumn("website_sections", action.sectionId, "settings", settings);
            return supabase
              .from("website_sections")
              .update({ settings } as never)
              .eq("id", action.sectionId)
              .eq("organization_id", orgId);
          });
          break;
        case "set_custom_block":
          await run(action.type, () => {
            const settings = writeCustomBlock(
              readColumn("website_sections", action.sectionId, "settings"),
              action.spec,
            );
            noteColumn("website_sections", action.sectionId, "settings", settings);
            return supabase
              .from("website_sections")
              .update({ kind: "custom", settings } as never)
              .eq("id", action.sectionId)
              .eq("organization_id", orgId);
          });
          break;
        case "add_section": {
          // Several sections added to the same page in one run must not all
          // claim the same slot, so the running count is used, not the snapshot.
          const used = nextSectionSort.get(action.pageId) ?? 0;
          const position = action.position ?? used;
          nextSectionSort.set(action.pageId, Math.max(used, position) + 1);
          await run(action.type, async () => {
            const { data: created, error } = await supabase
              .from("website_sections")
              .insert({
                organization_id: orgId,
                page_id: action.pageId,
                kind: action.kind,
                heading: action.heading ?? null,
                subheading: action.subheading ?? null,
                body: action.body ?? null,
                sort_order: position,
              })
              .select("id")
              .maybeSingle();
            if (error) return { error };
            if (!created?.id) return { error: new Error("Section was not created.") };
            {
              const id = String(created.id);
              if (action.ref) newSections.set(action.ref, id);
              sectionPage.set(id, action.pageId);
              nextComponentSort.set(id, 0);
              undoSteps.push({
                label: "add_section:remove",
                run: async () => {
                  await supabase
                    .from("website_sections")
                    .delete()
                    .eq("id", id)
                    .eq("organization_id", orgId);
                },
              });
            }
            return null;
          });
          break;
        }
        case "delete_section":
          await run(action.type, () =>
            supabase
              .from("website_sections")
              .delete()
              .eq("id", action.sectionId)
              .eq("organization_id", orgId),
          );
          break;
        case "reorder_sections":
          for (const [order, id] of action.sectionIds.entries()) {
            await run(action.type, () =>
              supabase
                .from("website_sections")
                .update({ sort_order: order })
                .eq("id", id)
                .eq("organization_id", orgId),
            );
          }
          break;
        case "set_component": {
          // Re-sanitize on write: link hrefs are rendered on the public site, so
          // only http(s)/mailto/tel/sms/relative targets may ever be persisted.
          const patch = { ...(action.patch as Record<string, unknown>) };
          if ("link_url" in patch)
            patch["link_url"] = safeLinkUrl(patch["link_url"] as string | null);
          await run(action.type, () =>
            supabase
              .from("website_components")
              .update(patch as never)
              .eq("id", action.componentId)
              .eq("organization_id", orgId),
          );
          break;
        }
        case "set_component_visual":
          await run(action.type, () => {
            const settings = writeComponentVisual(
              readColumn("website_components", action.componentId, "settings"),
              action.patch,
            );
            noteColumn("website_components", action.componentId, "settings", settings);
            const mediaUrl = action.patch["media_url"];
            const patch: Record<string, unknown> = { settings };
            if (mediaUrl !== undefined) patch["media_url"] = safeLinkUrl(mediaUrl);
            return supabase
              .from("website_components")
              .update(patch as never)
              .eq("id", action.componentId)
              .eq("organization_id", orgId);
          });
          break;
        case "add_component":
          await run(action.type, async () => {
            const sortOrder = nextComponentSort.get(action.sectionId) ?? 0;
            const { data: created, error } = await supabase
              .from("website_components")
              .insert({
                organization_id: orgId,
                section_id: action.sectionId,
                kind: action.kind,
                label: action.label ?? null,
                body: action.body ?? null,
                link_url: safeLinkUrl(action.link_url),
                link_label: action.link_label ?? null,
                sort_order: sortOrder,
              })
              .select("id")
              .maybeSingle();
            if (error) return { error };
            if (!created?.id) return { error: new Error("Component was not created.") };

            const id = String(created.id);
            nextComponentSort.set(action.sectionId, sortOrder + 1);
            componentSection.set(id, action.sectionId);
            if (action.ref) newComponents.set(action.ref, id);

            undoSteps.push({
              label: "add_component:remove",
              run: async () => {
                await supabase
                  .from("website_components")
                  .delete()
                  .eq("id", id)
                  .eq("organization_id", orgId);
              },
            });
            return null;
          });
          break;
        case "delete_component":
          await run(action.type, () =>
            supabase
              .from("website_components")
              .delete()
              .eq("id", action.componentId)
              .eq("organization_id", orgId),
          );
          break;
        case "add_page":
          await run(action.type, async () => {
            const { data: created, error } = await supabase
              .from("website_pages")
              .insert({
                organization_id: orgId,
                kind: action.kind,
                title: action.title,
                slug: action.slug,
                sort_order: site.pages.length + newPages.size,
              })
              .select("id")
              .maybeSingle();
            if (error) return { error };
            if (!created?.id) return { error: new Error("Page was not created.") };
            {
              const id = String(created.id);
              if (action.ref) newPages.set(action.ref, id);
              undoSteps.push({
                label: "add_page:remove",
                run: async () => {
                  await supabase
                    .from("website_pages")
                    .delete()
                    .eq("id", id)
                    .eq("organization_id", orgId);
                },
              });
            }
            return null;
          });
          break;
        case "set_page":
          await run(action.type, () =>
            supabase
              .from("website_pages")
              .update(action.patch as never)
              .eq("id", action.pageId)
              .eq("organization_id", orgId),
          );
          break;
        case "delete_page":
          await run(action.type, () =>
            supabase
              .from("website_pages")
              .delete()
              .eq("id", action.pageId)
              .eq("organization_id", orgId),
          );
          break;
        case "set_theme":
          await run(action.type, () =>
            supabase
              .from("business_profiles")
              .update(action.patch as never)
              .eq("organization_id", orgId),
          );
          break;
        case "set_backdrop":
          await run(action.type, () => {
            const generation = writeBackdrop(
              readColumn("website_settings", null, "generation"),
              action.backdrop,
            );
            noteColumn("website_settings", null, "generation", generation);
            return supabase
              .from("website_settings")
              .upsert({ organization_id: orgId, generation } as never, {
                onConflict: "organization_id",
              });
          });
          break;
        case "set_section_effect":
          await run(action.type, () => {
            const settings = writeSectionEffect(
              readColumn("website_sections", action.sectionId, "settings"),
              action.effect,
            );
            noteColumn("website_sections", action.sectionId, "settings", settings);
            return supabase
              .from("website_sections")
              .update({ settings } as never)
              .eq("id", action.sectionId)
              .eq("organization_id", orgId);
          });
          break;
        case "set_business_fact":
          await run(action.type, () =>
            supabase
              .from("business_profiles")
              .update({ [action.field]: action.value } as never)
              .eq("organization_id", orgId),
          );
          break;
      }
      void sortOf;
    }

    if (fatal) {
      const reversal = await rollback(undoSteps);
      await supabase.from("ai_generations").insert({
        organization_id: orgId,
        kind: "agent_apply_rolled_back",
        model: "applied",
        instruction: snapshotLabel,
        result: {
          operationId,
          applied,
          failed,
          reversal,
          mutations: undoSteps.length,
        } as unknown as never,
        created_by: userId,
      });
      invalidateWorkspaceContext(orgId);
      throw new Error(
        reversal.failed === 0
          ? "One of those steps couldn't be saved, so Revora put your website back exactly as it was. Nothing changed — please try again."
          : `One of those steps couldn't be saved. Revora undid what it could and saved the restore point "${snapshotLabel}" — open Version history to return your website to it.`,
      );
    }

    await supabase.from("ai_generations").insert({
      organization_id: orgId,
      kind: "agent_apply",
      model: "applied",
      instruction: snapshotLabel,
      result: {
        operationId,
        operationKey: data.operationKey || null,
        applied: applied.length,
        failed: failed.length,
        stale: preflight.stale.length,
        unchanged: settled.unchanged,
        duplicates: preflight.duplicates,
        staleNotice,
        appliedLabels: applied,
        skippedLabels: failed,
        snapshotLabel,
        snapshotVersion,
        mutations: undoSteps.length,
      } as unknown as never,

      created_by: userId,
    });

    invalidateWorkspaceContext(orgId);

    // TEST, then INSPECT. The writes are in place, so Revora now loads the real
    // pages a visitor would see and checks them. Anything that would be broken
    // for a visitor is reversed here — a change is never left live because the
    // database said it saved.
    let verification: VerificationReport | null = null;
    if (data.verify !== false) {
      try {
        const { verifyWorkspaceSite } = await import("@/lib/agent/verify.server");
        verification = await verifyWorkspaceSite(supabase, orgId);
      } catch (error) {
        console.error("[site-agent] verification could not run", error);
      }
      if (verification && verification.critical > 0) {
        const reversal = await rollback(undoSteps);
        await supabase.from("ai_generations").insert({
          organization_id: orgId,
          kind: "agent_apply_failed_verification",
          model: "applied",
          instruction: snapshotLabel,
          result: {
            operationId,
            applied,
            verification,
            reversal,
            mutations: undoSteps.length,
          } as unknown as never,
          created_by: userId,
        });
        invalidateWorkspaceContext(orgId);
        const worst = verification.checks
          .filter((check) => !check.ok && check.severity === "critical")
          .slice(0, 3)
          .map((check) => `${check.where}: ${check.label.toLowerCase()}`)
          .join("; ");
        throw new Error(
          reversal.failed === 0
            ? `Revora made those changes, checked your live pages, and found a problem (${worst}). It put your website back exactly as it was — nothing changed.`
            : `Revora found a problem after saving (${worst}) and undid what it could. Open Version history and return to "${snapshotLabel}".`,
        );
      }
    }

    // CHECK, REPAIR, CHECK AGAIN. The writes are in place and the live pages
    // verified, so Revora now runs its own QA pass over the saved rows, applies
    // only the repairs it can prove from the site's own data, and re-runs the
    // same checks so the report is measured rather than assumed. Anything
    // ambiguous stays a reported finding — it is never guessed at. A failure in
    // this stage is reported, never fatal: it must not undo a good apply.
    let qa: QaLoopResult | null = null;
    if (data.verify !== false) {
      noteApplyStage(orgId, applyRunId, "checking the result");
      try {
        const { runQaRepairLoop } = await import("@/lib/builder/qa-loop.server");
        qa = await runQaRepairLoop(supabase as unknown as never, orgId, data.label);
        if (qa.repaired.length) {
          invalidateWorkspaceContext(orgId);
          await supabase.from("ai_generations").insert({
            organization_id: orgId,
            kind: "agent_qa_repair",
            model: "applied",
            instruction: snapshotLabel,
            result: {
              operationId,
              before: qa.before,
              after: qa.after,
              repaired: qa.repaired,
              failed: qa.failed,
              reported: qa.reported,
            } as unknown as never,
            created_by: userId,
          });
        }
      } catch (error) {
        console.error("[site-agent] post-apply QA loop could not run", error);
      }
    }

    noteApplyStage(orgId, applyRunId, "finishing up");

    return {
      applied: applied.length,
      failed: failed.length,
      /** Steps that could not run because their target no longer exists. */
      stale: preflight.stale.length,
      /** Steps that needed no write because the site already matched them. */
      unchanged: settled.unchanged,
      staleNotice,
      duplicates: preflight.duplicates,
      /** Per-operation outcomes for the collapsed diagnostics panel. */
      details: [
        ...applied.map((label) => `applied ${label}`),
        ...failed.map((label) => `skipped ${label}`),
        ...preflight.stale.map((entry) => `stale ${entry.type} (${entry.reason})`),
        ...settled.unchangedLabels,
        ...(qa?.repaired ?? []).map((entry) => `repaired ${entry}`),
        ...(qa?.failed ?? []).map((entry) => `repair skipped ${entry}`),
      ],
      snapshotLabel,
      snapshotVersion,
      operationId,
      alreadyApplied: false,
      verification,
      /** Checked → repaired → checked again, measured on the saved rows. */
      qa,
    };
  }
}

/* ------------------------------ voice commands ----------------------------- */

/**
 * Transcribes a recorded voice command so the owner can talk to the assistant
 * instead of typing. Returns editable text only — nothing is changed here.
 */
export const transcribeVoiceCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; audio?: unknown }) => {
    const organizationId = orgIdOf(input);
    const [attachment] = readAttachments([input?.audio]);
    if (!attachment || attachment.kind !== "audio")
      throw new Error("That recording couldn't be read. Try recording again.");
    return { organizationId, attachment };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS: a member can only read their own workspace, so this is the tenant gate.
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (!org) throw new Error("Workspace not found.");

    const { transcribeVoice } = await import("@/lib/site-agent.server");
    const text = await transcribeVoice(data.attachment, {
      organizationId: data.organizationId,
      userId,
    });
    if (!text) return { text: "", message: "I couldn't hear anything in that recording." };

    await supabase.from("ai_generations").insert({
      organization_id: data.organizationId,
      kind: "voice_command",
      model: "revora-ai",
      instruction: "(voice note)",
      result: { text: text.slice(0, 4000) } as unknown as never,
      created_by: userId,
    });

    return { text: text.slice(0, PLAN_INSTRUCTION_LIMIT), message: null as string | null };
  });

/* ------------------------------ video chapters ----------------------------- */

/**
 * Indexes an attached clip into short chapters. Runs on upload so the owner can
 * say "use the moment at 0:12" when asking for a change. Nothing is written to
 * the website here.
 */
export const summarizeClipChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; video?: unknown }) => {
    const organizationId = orgIdOf(input);
    const [attachment] = readAttachments([input?.video]);
    if (!attachment || attachment.kind !== "video")
      throw new Error("That clip couldn't be read. Try a shorter MP4 or WebM.");
    return { organizationId, attachment };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS: a member can only read their own workspace, so this is the tenant gate.
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (!org) throw new Error("Workspace not found.");

    const { summarizeChapters } = await import("@/lib/site-agent.server");
    const result = await summarizeChapters(data.attachment, {
      organizationId: data.organizationId,
      userId,
    });

    if (result.chapters.length) {
      await supabase.from("ai_generations").insert({
        organization_id: data.organizationId,
        kind: "video_chapters",
        model: "revora-ai",
        instruction: `(clip: ${data.attachment.name})`,
        result: result as unknown as never,
        created_by: userId,
      });
    }

    return result;
  });

/* ------------------------------- autonomous run ---------------------------- */

/**
 * THE AUTONOMOUS RUN.
 *
 * One request in plain words, and Revora goes all the way:
 * UNDERSTAND → INSPECT → PLAN → EXECUTE → TEST → INSPECT → VERIFY → REPAIR →
 * RETEST → REPORT.
 *
 * Two rules keep this safe rather than reckless:
 * - Anything that removes something (a page, a section, a button) is never done
 *   on its own. Those steps come back for the owner to approve.
 * - Everything else is applied inside the existing all-or-nothing apply, with a
 *   verified restore point first and a real check of the live pages after. If the
 *   pages fail that check, the change is reversed and Revora tries once more
 *   with the failure in front of it. It never reports success it did not verify.
 */
export const runWebsiteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      organizationId: string;
      instruction: string;
      history?: { role: string; content: string }[];
      attachments?: unknown;
    }) => {
      const organizationId = orgIdOf(input);
      const instruction = str(input?.instruction, PLAN_INSTRUCTION_LIMIT);
      const attachments = readAttachments(input?.attachments);
      if (instruction.length < 3 && !attachments.length)
        throw new Error("Tell Revora what you'd like done — in your own words.");
      const history: AgentTurn[] = Array.isArray(input?.history)
        ? input.history
            .slice(-8)
            .map((turn) => ({
              role: turn?.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: str(turn?.content, 4000),
            }))
            .filter((turn) => turn.content.length > 0)
        : [];
      return { organizationId, instruction, history, attachments };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const userId = String(context.userId);
    const trail: string[] = [];

    const attempt = async (instruction: string, label: string) => {
      const plan = await planImpl(supabase, userId, {
        organizationId: data.organizationId,
        instruction,
        history: data.history,
        attachments: data.attachments,
      });
      const safe = plan.steps.filter((step: AgentStep) => !step.destructive);
      const needsApproval = plan.steps.filter((step: AgentStep) => step.destructive);
      if (!safe.length)
        return {
          plan,
          needsApproval,
          applied: null as null | Awaited<ReturnType<typeof applyImpl>>,
        };
      const applied = await applyImpl(supabase, userId, {
        organizationId: data.organizationId,
        actions: safe.map((step: AgentStep) => step.action),
        label,
        verify: true,
      });
      return { plan, needsApproval, applied };
    };

    let outcome: Awaited<ReturnType<typeof attempt>>;
    try {
      outcome = await attempt(data.instruction, "Before Revora's autonomous run");
      trail.push(
        outcome.applied
          ? `Applied ${outcome.applied.applied} change${outcome.applied.applied === 1 ? "" : "s"} and checked your live pages`
          : "Planned the work — nothing could be done without your approval",
      );
    } catch (first) {
      const reason = first instanceof Error ? first.message : "the change did not hold";
      trail.push("First attempt was reversed automatically, so your site was never left broken");
      // REPAIR, then RETEST. The second attempt is told exactly what went wrong.
      try {
        outcome = await attempt(
          `${data.instruction}\n\nYour previous attempt was rolled back because the live pages failed this check: ${reason} Fix that cause in this attempt.`,
          "Before Revora's repaired run",
        );
        trail.push("Repaired it and the live pages passed on the second attempt");
      } catch (second) {
        const detail = second instanceof Error ? second.message : reason;
        await supabase.from("ai_generations").insert({
          organization_id: data.organizationId,
          kind: "agent_autorun_failed",
          model: "autorun",
          instruction: data.instruction.slice(0, 4000),
          result: { reason, detail } as unknown as never,
          created_by: userId,
        });
        throw new Error(
          `Revora tried this twice and reversed both attempts, so your website is exactly as it was. ${detail}`,
        );
      }
    }

    if (outcome.needsApproval.length)
      trail.push(
        `Held back ${outcome.needsApproval.length} step${outcome.needsApproval.length === 1 ? "" : "s"} that would remove something — those need your approval`,
      );

    await supabase.from("ai_generations").insert({
      organization_id: data.organizationId,
      kind: "agent_autorun",
      model: "autorun",
      instruction: data.instruction.slice(0, 4000),
      result: {
        applied: outcome.applied?.applied ?? 0,
        verification: outcome.applied?.verification ?? null,
        heldBack: outcome.needsApproval.length,
      } as unknown as never,
      created_by: userId,
    });

    return {
      reply: outcome.plan.reply,
      summary: outcome.plan.summary,
      notes: outcome.plan.notes,
      requirements: outcome.plan.requirements,
      trace: [...outcome.plan.trace, ...trail].slice(0, 14),
      applied: outcome.applied?.applied ?? 0,
      snapshotLabel: outcome.applied?.snapshotLabel ?? null,
      snapshotVersion: outcome.applied?.snapshotVersion ?? null,
      verification: outcome.applied?.verification ?? null,
      approvalSteps: outcome.needsApproval,
    };
  });

/**
 * What the media buttons can honestly do right now.
 *
 * Reading a photo, a clip or a voice note needs a listening/vision model, which
 * Revora's own free engine does not include. This tells the browser the truth so
 * the buttons say what will happen instead of failing after the recording.
 */
export const builderMediaCapabilities = createServerFn({ method: "GET" }).handler(async () => {
  const { builderMediaAvailability } = await import("@/lib/ai/availability");
  const media = builderMediaAvailability();
  return {
    voice: media.voice,
    vision: media.vision,
    note: media.vision
      ? ""
      : "Type your request — photos stay attached for you to place.",
  };
});
