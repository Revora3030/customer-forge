/**
 * FIRST-BUILD COMPOSITIONS.
 *
 * After the pages and sections exist, Sol designs every content section from
 * scratch as an open composition tree. Built-in section layouts are never used
 * for a new site: the section's own words, pictures and links are only the
 * material Sol composes with.
 *
 * Working parts that must keep running (forms, booking, embeds, post lists and
 * the sticky mobile action) stay as they are. Every tree passes the safety
 * validator and the fact check; an invalid tree gets one repair attempt, and a
 * section still without a valid AI layout stops the build — there is no
 * substitute design.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { craftBarPrompt } from "@/lib/builder/world-class-craft";
import { screenText } from "@/lib/builder/collective-copy";
import { repairContactDetails } from "@/lib/builder/chrome-repair";
import {
  COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE,
  isSafeHref,
  readComposition,
  validateComposition,
  writeComposition,
  type CompositionIssue,
  type CompositionTree,
} from "@/lib/builder/composition-tree";
import type { DnaFacts } from "@/lib/business-dna";
import { runAdvisoryPanel, runReviewPanel } from "@/lib/builder/review-panel.server";
import { NO_EVIDENCE, allEvidence, gatherReviewEvidence, type ReviewEvidence } from "@/lib/builder/review-evidence.server";
import { runImprovementGate, type GateReport } from "@/lib/builder/improvement-gate.server";
import { detectGenericPhrases } from "@/lib/builder/genericity";
import { auditPageDesign, needsDesignRepair, type DesignFinding } from "@/lib/builder/design-quality";

const IMPROVEMENT_ROUNDS = 2;

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** How many pages are designed at the same time on a first build. */
const PAGE_CONCURRENCY = 3;

/** Sections whose job is a working feature, not a layout. */
export const FUNCTIONAL_SECTION_KINDS = new Set([
  "embed", "post_list",
]);

type SectionRow = {
  id: string;
  page_id: string;
  kind: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  settings: unknown;
};
type ComponentRow = {
  id: string;
  section_id: string;
  kind: string;
  label: string | null;
  body: string | null;
  media_url: string | null;
  link_url: string | null;
  link_label: string | null;
  settings?: unknown;
};

export type CompositionPassResult = {
  composed: number;
  kept: number;
  models: string[];
  costMicrocents: number;
  /** One entry per improvement round: whether the team's revision beat the prior version. */
  gateReports: GateReport[];
  /** Content sections that never got an AI layout and kept the default one. */
  fallback?: number;
  /** Craft findings sent back to Sol for revision, and how many remained. */
  designRepairs?: number;
  designFindings?: number;
  /** Pages whose optional quality rounds were skipped to stay within the time budget. */
  optionalSkipped?: number;
};

const RULES = [
  "You are Sol, the lead art director of a world-class web studio.",
  `Design each section from scratch as a composition tree built only from these primitives: ${COMPOSITION_PRIMITIVES.join(", ")}.`,
  PRIMITIVE_GUIDE,
  "Node shape: {type, text?, href?, src?, mediaRef?, alt?, level?, items?, beforeImage?, afterImage?, initialSplit?, faqItems?, tabs?, primaryCta?, secondaryCta?, style?, responsive?: {mobile?, tablet?, desktop?}, motion?: {kind: none|fade|rise|scale|float|slide-left|slide-right|blur|reveal, delayMs?, durationMs?}, children?}.",
  "Pictures marked aiGenerated are AI-made illustrations, not the business's real work: never place them in a compare or before_after_slider, a gallery captioned as completed jobs, or any caption that calls them a real project, customer, result or team member.",
  "Studio interactive primitives: before_after_slider uses beforeImage:{src,alt,label}, afterImage:{src,alt,label}, and initialSplit 0-100 (default 50); use it when supplied material genuinely shows a transformation. faq_accordion uses faqItems:[{question,answer,defaultOpen?}] and only supplied FAQ copy. tab_group uses tabs:[{label,children:[...]}] and renders one active panel at a time. mobile_sticky_bar uses primaryCta:{label,href,ariaLabel?} and optional secondaryCta with safe conversion destinations; it is mobile-only and must never duplicate a desktop CTA unnecessarily.",
  "Interactive quality: use these primitives when they clarify real content, not as decoration. Keep every control at least 44px, make labels concise, preserve 4.5:1 text contrast, and design for touch and keyboard. Do not invent phone numbers, URLs, prices, FAQs, service tiers, before/after claims or other business facts.",
  "style keys: columns, gap, padding, paddingX, paddingY, maxWidth, align, justify, items, span, size, weight, lineHeight, letterSpacing, italic, uppercase, font, color, background, gradientTo, gradientAngle, radius, borderWidth, borderColor, shadow, opacity, aspect, objectFit, minHeight, hidden, position, top, left, right, bottom, zIndex, overlap, blur, rotate, gridAreas, area. Colours are #RRGGBB.",
  "Use ONLY the words, pictures and links supplied for the section — you may restructure, never invent facts, prices, reviews, awards or results.",
  "Every supplied picture must appear visibly as a media node using its exact mediaRef. Never copy its private storage path into src.",
  "Text on a background needs contrast of at least 4.5. Buttons need an href. Images need alt text. Collapse to one column on mobile.",
  "Buttons and links only use supplied hrefs: the section's own part hrefs, \"/\" and \"/<page-slug>\" for this site's pages, the business's tel:/mailto:, or an anchor of a real section role such as \"#contact\". Never \"#\", empty or invented URLs. Every services, offer, process and closing section ends in one clear action button.",
  "Make every creative choice from the authored brief and supplied material; no platform house style is implied.",
  "Reject generic AI layout recipes. Do not default to a center-stacked hero with a generic two-button row over a soft gradient, a repetitive three-card icon grid directly below the hero, or identical card/padding treatment repeated across the page.",
  "Mandate editorial variation when the material supports it: asymmetric two-column editorial splits, bento-style feature grids, overlapping hero frames with offset media cards, dynamic proof banners, staggered service showcases, full-bleed image moments and purposeful alignment breaks. These are composition options, not a template; choose only what serves this business.",
  "Establish page rhythm intentionally: generous breathing room around hero/ethos moments, tighter structured grids for pricing/specifications, and dedicated full-width premium containers for booking, quote and contact mechanics.",
  "On mobile 320px–390px, author deliberate responsive overrides on every complex node: headings scale fluidly, columns collapse to 1 where appropriate, grids use minmax(0,1fr), controls are at least 44px high, and margins/padding/media crops are adjusted so nothing collides, clips or wraps awkwardly.",
  "For booking, contact and quote sections, make the working form/contact/quote widget a deliberate full-width feature: use columns:1, maxWidth:680px and margin:auto on its immediate authored wrapper.",
  "For service and pricing cards, include a styled button primitive with a clear action label such as Book Service or Get Quote whenever the supplied material provides a valid destination href.",
  "Never output placeholder or fixture language, including phrases such as fictional studio or test-fixture service, in headings, descriptions, labels or button text. Use only supplied business material.",
  "On mobile, keep functional forms and conversion controls one column and full width while preserving the authored visual hierarchy.",
  "For services sections, prefer a service_menu widget so prices and services stay in sync with the owner's Services tool; for social_proof sections, a review_wall widget shows the owner's published reviews (it hides itself when none exist). Never retype prices or reviews.",
  "For quote sections, the composition MUST contain one quote_calculator widget; for booking sections, one booking_form widget; for contact sections, one enquiry_form widget (the working message form) AND one contact_details widget. These widgets are the only application-owned mechanics — you own their entire surrounding layout and their widgetPresentation.",
  "Every working widget in a first build MUST include widgetPresentation with an AI-authored title, actionLabel when actionable, successTitle/successBody when it submits, appropriate fieldLabels, and a local theme using surface, text, muted, border, action and actionText. Choose the palette yourself for this specific site; do not reuse a generic form palette.",
  'widgetPresentation shape: {"eyebrow":"...","title":"...","description":"...","optionPrompt":"...","estimateLabel":"...","extraLabel":"...","actionLabel":"...","backLabel":"...","successTitle":"...","successBody":"...","contactLabel":"...","fieldLabels":{"service":"...","name":"...","phone":"...","email":"...","location":"...","date":"...","time":"...","details":"..."},"theme":{"surface":"#RRGGBB","text":"#RRGGBB","muted":"#RRGGBB","border":"#RRGGBB","action":"#RRGGBB","actionText":"#RRGGBB","selected":"#RRGGBB","selectedText":"#RRGGBB"}}',
  "Widget presentation copy must be specific to the supplied business and the section's role. Avoid stock phrases and generic filler such as 'choose your options', 'request your appointment', 'lock in this price', 'anything we should know', 'before you request a time', or 'without the guesswork' unless those exact words are genuinely appropriate to the supplied business.",
  "Use any validated composition, depth, hierarchy, spacing, media treatment, and motion the authored brief calls for. On mobile, provide responsive overrides wherever needed so nothing collides at 320px.",
  // MEASURABLE CRAFT BAR (checked automatically after you answer; misses come back to you):
  "Measurable craft bar, checked automatically: the first section of every page leads with ONE level-1 heading of at least 40px desktop / 30px+ mobile and one clear primary button using a supplied href; paragraph copy is 16-18px with lineHeight 1.5-1.7 and a text column of maxWidth 640-760px; heading sizes step down clearly by level (about 1.25-1.5x per level); every grid of 3+ columns has responsive.mobile.columns (1, or 2 for small tiles); never more than 4 columns of paragraph copy; sections get generous vertical padding (64-128px desktop, 48-72px mobile); no section is a single bare element; never repeat the previous section's exact structure.",
  craftBarPrompt("layout"),
].join(" ");

function materialFor(section: SectionRow, parts: ComponentRow[]) {
  return {
    sectionId: section.id,
    role: section.kind,
    heading: section.heading,
    subheading: section.subheading,
    body: section.body,
    workingWidget: requiredWidgetForRole(section.kind),
    parts: parts.map((part) => ({
      kind: part.kind,
      label: part.label,
      body: part.body,
      mediaRef: part.media_url ? part.id : null,
      // AI_GENERATED_DRAFT / NOT_VERIFIED_WORK_PROOF: illustrative only.
      ...(part.media_url && isGeneratedPart(part) ? { aiGenerated: true } : {}),
      href: part.link_url && isSafeHref(part.link_url) ? part.link_url : null,
      linkLabel: part.link_label,
    })),
  };
}

function isGeneratedPart(part: ComponentRow): boolean {
  const visual = (part.settings as { visual?: { source?: unknown } } | null | undefined)?.visual;
  return visual?.source === "generated";
}

function requiredWidgetForRole(role: string): "booking_form" | "quote_calculator" | "enquiry_form" | null {
  if (role === "booking") return "booking_form";
  if (role === "quote") return "quote_calculator";
  // A contact section must let a visitor actually send a message; showing
  // only a phone number and email captured no lead at all.
  if (role === "contact") return "enquiry_form";
  return null;
}

function findWidget(root: CompositionTree["root"], name: string): CompositionTree["root"] | null {
  if (root.type === "widget" && root.text === name) return root;
  for (const child of root.children ?? []) {
    const found = findWidget(child, name);
    if (found) return found;
  }
  return null;
}

function widgetPresentationProblem(role: string, widget: CompositionTree["root"]): string | null {
  const presentation = widget.widgetPresentation;
  if (!presentation) return `the ${role} widget needs AI-authored widgetPresentation`;
  if (!presentation.title?.trim()) return `the ${role} widget needs an AI-authored title`;
  if (role === "quote" || role === "booking") {
    if (!presentation.actionLabel?.trim()) return `the ${role} widget needs an AI-authored actionLabel`;
    if (!presentation.successTitle?.trim() || !presentation.successBody?.trim())
      return `the ${role} widget needs AI-authored success copy`;
  }
  const theme = presentation.theme;
  if (!theme?.surface || !theme.text || !theme.muted || !theme.border || !theme.action || !theme.actionText)
    return `the ${role} widget needs a complete AI-authored local theme`;
  const presentationText = [presentation.eyebrow, presentation.title, presentation.description, presentation.optionPrompt, presentation.estimateLabel, presentation.extraLabel, presentation.actionLabel, presentation.backLabel, presentation.successTitle, presentation.successBody, presentation.contactLabel, ...Object.values(presentation.fieldLabels ?? {})].filter((value): value is string => typeof value === "string");
  const genericHits = detectGenericPhrases(presentationText);
  if (genericHits.length) return `the ${role} widget presentation contains stock phrasing: ${genericHits.map((hit) => hit.phrase).join(", ")}`;
  return null;
}

function mediaRefsFor(section: SectionRow, parts: ComponentRow[]) {
  return new Set(
    parts
      .filter((part) => part.section_id === section.id && Boolean(part.media_url))
      .map((part) => part.id),
  );
}

function parseTrees(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { sections?: unknown };
    return parsed.sections && typeof parsed.sections === "object" && !Array.isArray(parsed.sections)
      ? (parsed.sections as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function composeFirstBuildSections(input: {
  db: Db;
  organizationId: string;
  facts: DnaFacts;
  lookSummary: string;
  /**
   * Epoch ms after which the OPTIONAL quality rounds (advisory panel, craft
   * repair, team improvement) are skipped. The required per-section AI design
   * and its safety validation always run. Without a budget a large site spent
   * so long in optional rounds that the worker was cut off and the build
   * failed at the layout stage on every attempt.
   */
  optionalPassDeadline?: number;
  /** Called between pages so the caller can renew its job lease. */
  onPageDone?: () => Promise<void> | void;
}): Promise<CompositionPassResult> {
  const { db, organizationId, facts } = input;
  const withinBudget = () => input.optionalPassDeadline === undefined || Date.now() < input.optionalPassDeadline;
  const [{ data: sections, error }, { data: components }] = await Promise.all([
    db.from("website_sections").select("id,page_id,kind,heading,subheading,body,settings").eq("organization_id", organizationId).order("sort_order"),
    db.from("website_components").select("id,section_id,kind,label,body,media_url,link_url,link_label,settings").eq("organization_id", organizationId).order("sort_order"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (sections ?? []) as SectionRow[];
  const parts = (components ?? []) as ComponentRow[];
  // Prices already written on the owner's own site are supplied facts.
  const materialText = [
    ...rows.map((r) => [r.heading, r.subheading, r.body].join(" ")),
    ...parts.map((c) => [c.label, c.body, c.link_label].join(" ")),
  ].join(" ");
  const screenFacts = /[$€£]\s?\d/.test(materialText) ? { ...facts, hasPrices: true } : facts;
  const screen = (text: string) => {
    const problem = screenText(text, screenFacts, 4000);
    return problem && problem !== "empty" ? problem : null;
  };
  // A made-up phone number or email in a layout is corrected to the owner's
  // real one (or the contact page) instead of costing the whole section.
  const pageRows = await db.from("website_pages").select("slug,kind").eq("organization_id", organizationId);
  const contactSlug = ((pageRows.data ?? []) as { slug: string; kind: string | null }[]).find((page) =>
    ["contact", "book", "booking", "quote", "contact-us"].includes(page.slug) || /contact|book|quote/i.test(String(page.kind ?? "")),
  )?.slug;
  const fixContacts = (raw: unknown) =>
    repairContactDetails(raw, {
      phone: facts.phone ?? null,
      email: facts.email ?? null,
      enquiryHref: contactSlug ? `/${contactSlug}` : null,
    }).value;

  const byPage = new Map<string, SectionRow[]>();
  for (const row of rows) {
    if (FUNCTIONAL_SECTION_KINDS.has(row.kind)) continue;
    byPage.set(row.page_id, [...(byPage.get(row.page_id) ?? []), row]);
  }

  const result: CompositionPassResult = { composed: 0, kept: rows.length, models: [], costMicrocents: 0, gateReports: [], fallback: 0 };
  // The wider team advises Sol before the first design, from supplied material
  // only. A failed adviser is skipped; advice never blocks a build.
  let advice: { area: string; issues: string[] }[] = [];
  if (withinBudget()) try {
    const panel = await runAdvisoryPanel({
      organizationId,
      material: JSON.stringify(rows.filter((r) => !FUNCTIONAL_SECTION_KINDS.has(r.kind)).map((s) => materialFor(s, parts.filter((p) => p.section_id === s.id)))),
    });
    result.models.push(...panel.models);
    result.costMicrocents += panel.costMicrocents;
    advice = panel.notes.filter((n) => n.issues.length).map(({ area, issues }) => ({ area, issues }));
  } catch (error) {
    console.warn("advisory panel skipped", (error as Error).message);
  }

  // Pages are designed in parallel (a few at a time). Designing every page one
  // after another made a large site's layout stage run longer than the build
  // could stay alive, so first builds died at 74% and the site was left on
  // plain placeholder layouts.
  const composePage = async (allPageSections: SectionRow[]) => {
    // A section that already carries a valid saved AI layout (an earlier pass
    // of this build got that far) is kept instead of being designed again.
    const pageSections = allPageSections;
    for (const section of allPageSections) {
      const saved = readComposition(section.settings);
      if (saved) {
        result.composed += 1;
        result.kept -= 1;
      }
    }
    let pending = allPageSections.filter((section) => !readComposition(section.settings));
    if (!pending.length) {
      await input.onPageDone?.();
      return;
    }
    // Smaller batches: a page with many sections asked for one huge JSON
    // answer that was regularly cut off at the output limit, so every section
    // on that page failed together. Sections are designed a few at a time.
    const BATCH = 4;
    let feedback: Record<string, CompositionIssue[]> = {};
    const designed = new Map<string, CompositionTree>();
    let pageFailed = false;
    // A single failed call is often a transient rate limit or timeout. The
    // page is only abandoned after two failed calls, so one hiccup no longer
    // leaves every section on that page with a plain default layout.
    let failedCalls = 0;
    for (let attempt = 0; attempt < 3 && pending.length && !pageFailed; attempt += 1) {
     const batches: SectionRow[][] = [];
     for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
     const next: SectionRow[] = [];
     const nextFeedback: Record<string, CompositionIssue[]> = {};
     for (const batch of batches) {
      const batchFeedback = Object.fromEntries(Object.entries(feedback).filter(([id]) => batch.some((s) => s.id === id)));
      const call = await callBestThinker({
        json: true,
        purpose: "creative_direction",
        complexity: "high",
        organizationId,
        maxOutputTokens: 24000,
        system: RULES,
        user: [
          "SITE LOOK (follow it):",
          input.lookSummary,
          "",
          "SECTIONS TO DESIGN (material only):",
          JSON.stringify(batch.map((s) => materialFor(s, parts.filter((p) => p.section_id === s.id))), null, 2),
          ...(designed.size
            ? ["", "SECTIONS ALREADY DESIGNED ON THIS PAGE (match their visual language; vary rhythm, do not repeat their structure):", JSON.stringify([...designed.values()].map((t) => t.label ?? "section").slice(0, 8))]
            : []),
          ...(advice.length ? ["", "TEAM ADVICE (independent reviewers; use your judgement, never invent facts):", JSON.stringify(advice)] : []),
          ...(Object.keys(batchFeedback).length ? ["", "FIX THESE PROBLEMS FROM YOUR LAST ATTEMPT:", JSON.stringify(batchFeedback, null, 2)] : []),
          "",
          'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with one tree per section.',
        ].join("\n"),
      });
      if (!call.ok) {
        // This page's design call failed. It is retried once; sections still
        // without a layout are counted in `fallback` and stop a first build.
        console.warn(`[first-build-compositions] AI layout failed: ${call.detail ?? call.reason}`);
        failedCalls += 1;
        if (failedCalls >= 2) pageFailed = true;
        else await new Promise((resolve) => setTimeout(resolve, 1500));
        next.push(...batch);
        continue;
      }
      if (call.model) result.models.push(call.model);
      result.costMicrocents += call.costMicrocents ?? 0;
      const trees = parseTrees(call.text) ?? {};
      for (const section of batch) {
        const mediaRefs = mediaRefsFor(section, parts);
        const checked = validateComposition(fixContacts(trees[section.id]), {
          screenText: screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        if (!checked.ok) {
          nextFeedback[section.id] = checked.issues.slice(0, 12);
          next.push(section);
          continue;
        }
        const widgetName = requiredWidgetForRole(section.kind);
        if (widgetName) {
          const widget = findWidget(checked.tree.root, widgetName);
          const problem = widget ? widgetPresentationProblem(section.kind, widget) : `the ${section.kind} section must contain a ${widgetName} widget`;
          if (problem) {
            nextFeedback[section.id] = [{ path: "root", problem }];
            next.push(section);
            continue;
          }
        }
        designed.set(section.id, checked.tree);
      }
     }
      feedback = nextFeedback;
      pending = next;
    }
    // Rescue pass: sections still without a layout are designed one at a time.
    // A single-section answer is small, so it survives the output limits and
    // model timeouts that sink a batch of four.
    if (pending.length) {
      const rescued = await Promise.all(pending.map(async (section) => {
        const call = await callBestThinker({
          json: true,
          purpose: "creative_direction",
          complexity: "high",
          organizationId,
          maxOutputTokens: 12000,
          system: RULES,
          user: [
            "SITE LOOK (follow it):",
            input.lookSummary,
            "",
            "SECTION TO DESIGN (material only):",
            JSON.stringify([materialFor(section, parts.filter((p) => p.section_id === section.id))], null, 2),
            ...(feedback[section.id]?.length ? ["", "FIX THESE PROBLEMS FROM YOUR LAST ATTEMPT:", JSON.stringify(feedback[section.id], null, 2)] : []),
            "",
            'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with exactly one tree.',
          ].join("\n"),
        });
        if (!call.ok) return false;
        if (call.model) result.models.push(call.model);
        result.costMicrocents += call.costMicrocents ?? 0;
        const trees = parseTrees(call.text) ?? {};
        const mediaRefs = mediaRefsFor(section, parts);
        const checked = validateComposition(fixContacts(trees[section.id] ?? Object.values(trees)[0]), {
          screenText: screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        if (!checked.ok) {
          feedback[section.id] = checked.issues.slice(0, 12);
          return false;
        }
        const widgetName = requiredWidgetForRole(section.kind);
        if (widgetName) {
          const widget = findWidget(checked.tree.root, widgetName);
          if (!widget || widgetPresentationProblem(section.kind, widget)) return false;
        }
        designed.set(section.id, checked.tree);
        return true;
      }));
      pending = pending.filter((_, index) => !rescued[index]);
    }
    if (pending.length) {
      // Some sections could not get a safe AI layout after retries. The count
      // is reported so callers stop rather than ship a default layout.
      const first = Object.values(feedback).flat()[0];
      console.warn(
        `[first-build-compositions] ${pending.length} section(s) could not get an AI layout` +
          (first ? ` (${first.path}: ${first.problem})` : "") + ".",
      );
      result.fallback = (result.fallback ?? 0) + pending.length;
    }
    // Search data only exists for a verified domain; a lookup failure never blocks the build.
    let domain: string | null = null;
    try {
      const { data: settings } = await db
        .from("website_settings")
        .select("custom_domain,domain_verified")
        .eq("organization_id", organizationId)
        .maybeSingle();
      domain = settings?.domain_verified ? settings.custom_domain : null;
    } catch {
      domain = null;
    }
    const evidence = await gatherReviewEvidence({
      industry: facts.industry ?? null,
      businessName: facts.businessName ?? null,
      city: facts.city ?? null,
      siteUrl: domain ? `https://${domain}/` : null,
    }).catch(() => NO_EVIDENCE);
    // Shared memory: the same owner preferences the chat agent recalls.
    let memory: string | null = null;
    try {
      const { recallBrief } = await import("@/lib/builder/session-memory.server");
      memory = await recallBrief(db as never, organizationId);
    } catch {
      memory = null;
    }
    // DESIGN QUALITY BAR: measurable craft (headline scale, readable copy,
    // phone layouts, rhythm, an action in the opening section). Sections that
    // fall short go back to Sol with exact repair notes before anything is saved.
    // Optional craft rounds run only while the time budget allows; the
    // validated AI design above is always kept either way.
    if (withinBudget()) {
      await repairDesignQuality({ organizationId, lookSummary: input.lookSummary, sections: pageSections, parts, designed, screen, result });
    } else {
      result.optionalSkipped = (result.optionalSkipped ?? 0) + 1;
    }
    const best = withinBudget()
      ? await improveWithTeam({ organizationId, lookSummary: input.lookSummary, evidence, memory, sections: pageSections, parts, designed, screen, result })
      : new Map(designed);
    // The team round can only replace a tree with a validated one; if it made
    // the craft worse, the pre-team design is kept for that section.
    const before = auditPageDesign(pageSections.filter((s) => designed.has(s.id)).map((s) => ({ id: s.id, role: s.kind, tree: designed.get(s.id)! })));
    const after = auditPageDesign(pageSections.filter((s) => best.has(s.id)).map((s) => ({ id: s.id, role: s.kind, tree: best.get(s.id)! })));
    for (const section of pageSections) {
      const worse = (after[section.id]?.length ?? 0) > (before[section.id]?.length ?? 0);
      if (worse && designed.has(section.id)) best.set(section.id, designed.get(section.id)!);
    }
    result.designFindings = (result.designFindings ?? 0) + Object.values(after).reduce((n, list) => n + list.length, 0);
    for (const section of pageSections) {
      const tree = best.get(section.id);
      if (!tree) continue;
      await saveTree(db, organizationId, section, tree);
      result.composed += 1;
      result.kept -= 1;
    }
    await input.onPageDone?.();
  };
  const pages = [...byPage.values()];
  let nextPage = 0;
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, async () => {
      while (nextPage < pages.length) {
        const page = pages[nextPage++]!;
        await composePage(page);
      }
    }),
  );
  return result;
}

/**
 * Sends sections that miss the design quality bar back to Sol with exact,
 * measurable repair notes (up to two rounds). A revision is only accepted when
 * it passes every safety check AND has fewer craft findings than before, so
 * this pass can never make a section worse.
 */
async function repairDesignQuality(input: {
  organizationId: string;
  lookSummary: string;
  sections: SectionRow[];
  parts: ComponentRow[];
  designed: Map<string, CompositionTree>;
  screen: (text: string) => string | null;
  result: CompositionPassResult;
}) {
  for (let round = 0; round < 2; round += 1) {
    const ordered = input.sections.filter((s) => input.designed.has(s.id));
    const audit = auditPageDesign(ordered.map((s) => ({ id: s.id, role: s.kind, tree: input.designed.get(s.id)! })));
    const failing = ordered.filter((s) => audit[s.id] && needsDesignRepair(audit[s.id]!));
    if (!failing.length) return;
    const notes: Record<string, { path: string; fix: string }[]> = {};
    for (const s of failing) notes[s.id] = (audit[s.id] as DesignFinding[]).map(({ path, fix }) => ({ path, fix }));
    const call = await callBestThinker({
      json: true,
      purpose: "creative_direction",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 24000,
      system: RULES,
      user: [
        "SITE LOOK (follow it):", input.lookSummary, "",
        "SECTION MATERIAL:",
        JSON.stringify(failing.map((s) => materialFor(s, input.parts.filter((p) => p.section_id === s.id)))), "",
        "YOUR CURRENT DESIGN:", JSON.stringify(Object.fromEntries(failing.map((s) => [s.id, input.designed.get(s.id)]))), "",
        "SENIOR DESIGNER REVIEW — these are measurable craft problems a top studio would never ship. Fix every one, keep everything that already works (media refs, widgets, copy):",
        JSON.stringify(notes, null, 2), "",
        'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with one improved tree per listed section.',
      ].join("\n"),
    });
    if (!call.ok) return;
    if (call.model) input.result.models.push(call.model);
    input.result.costMicrocents += call.costMicrocents ?? 0;
    const trees = parseTrees(call.text) ?? {};
    let improved = 0;
    for (const section of failing) {
      const mediaRefs = mediaRefsFor(section, input.parts);
      const checked = validateComposition(trees[section.id], {
        screenText: input.screen,
        allowedMediaRefs: mediaRefs,
        requiredMediaRefs: mediaRefs,
      });
      if (!checked.ok) continue;
      const widgetName = requiredWidgetForRole(section.kind);
      if (widgetName) {
        const widget = findWidget(checked.tree.root, widgetName);
        if (!widget || widgetPresentationProblem(section.kind, widget)) continue;
      }
      const index = ordered.findIndex((s) => s.id === section.id);
      const trial = ordered.map((s) => ({ id: s.id, role: s.kind, tree: s.id === section.id ? checked.tree : input.designed.get(s.id)! }));
      const nextFindings = auditPageDesign(trial)[section.id] ?? [];
      if (index >= 0 && nextFindings.length < (audit[section.id]?.length ?? 0)) {
        input.designed.set(section.id, checked.tree);
        improved += 1;
      }
    }
    input.result.designRepairs = (input.result.designRepairs ?? 0) + improved;
    if (!improved) return;
  }
}

async function saveTree(db: Db, organizationId: string, section: SectionRow, tree: CompositionTree) {
  // The section's original job (contact, services, booking…) is kept so the
  // renderer can give it a matching anchor: "#contact" buttons then scroll to
  // the real contact section instead of doing nothing.
  const settings = { ...writeComposition(section.settings, tree), role: section.kind };
  const { error } = await db
    .from("website_sections")
    .update({ kind: "composition", settings } as never)
    .eq("id", section.id)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}

/**
 * The wider team gives Sol notes, Sol may revise from them, and the gate only
 * rejects renderer-unsafe output. It never scores or overrules creative taste.
 */
async function improveWithTeam(input: {
  organizationId: string;
  lookSummary: string;
  evidence: ReviewEvidence;
  memory?: string | null;
  sections: SectionRow[];
  parts: ComponentRow[];
  designed: Map<string, CompositionTree>;
  screen: (text: string) => string | null;
  result: CompositionPassResult;
}): Promise<Map<string, CompositionTree>> {
  let best = input.designed;
  const material = JSON.stringify(
    input.sections.map((s) => materialFor(s, input.parts.filter((p) => p.section_id === s.id))),
  );
  for (let round = 0; round < IMPROVEMENT_ROUNDS; round += 1) {
    try {
      const current = Object.fromEntries(best);
      const panel = await runReviewPanel({
        organizationId: input.organizationId,
        mode: "full",
        evidence: input.evidence,
        material: [
          "SUPPLIED MATERIAL:", material, "",
          ...(input.memory ? ["OWNER'S STANDING PREFERENCES:", input.memory, ""] : []),
          "SOL'S DESIGN:", JSON.stringify(current),
        ].join("\n"),
      });
      input.result.models.push(...panel.models);
      input.result.costMicrocents += panel.costMicrocents;
      const notes = panel.notes.filter((n) => n.issues.length);
      if (!notes.length) break;
      const call = await callBestThinker({
        json: true,
        purpose: "creative_direction",
        complexity: "high",
        organizationId: input.organizationId,
        maxOutputTokens: 16000,
        system: RULES,
        user: [
          "SITE LOOK (follow it):", input.lookSummary, "",
          "SECTION MATERIAL:", material, "",
          ...(input.memory ? ["OWNER'S STANDING PREFERENCES (from past conversations; honour them):", input.memory, ""] : []),
          ...(allEvidence(input.evidence) ? ["OUTSIDE EVIDENCE (context only — never copy onto the site as this business's facts):", allEvidence(input.evidence)!, ""] : []),
          "YOUR CURRENT DESIGN:", JSON.stringify(current), "",
          "NODE-LEVEL DIRECTIVES (prioritize these exact Terra/reviewer issues):", JSON.stringify(
            notes.map((note) => ({
              area: note.area,
              directives: note.issues.map((issue) => issue.trim()),
            })),
          ), "",
          "REVIEW PANEL NOTES (use your judgement; improve, never downgrade):", JSON.stringify(notes), "",
          "Revision strategy: preserve strong existing nodes, media references, working widgets and successful hierarchy. Do NOT wipe and regenerate an entire page because one node is flagged. Refactor or replace only the affected node(s), and keep every unaffected section intact unless a reviewer directive proves it must change.",
          "Prioritize concrete directives such as cta_buried, contrast_below_4.5, mobile_wrapping_risk, monotonous_rhythm, overflow, inaccessible controls, broken media or widget failures before aesthetic refinements.",
          "The revision is provisional until every changed tree is validated against COMPOSITION_PRIMITIVES, its supplied media references and fact screen, then accepted by runImprovementGate. Never commit a tree that fails those checks.",
          'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with one improved tree per section.',
        ].join("\n"),
      });
      if (!call.ok) break;
      if (call.model) input.result.models.push(call.model);
      input.result.costMicrocents += call.costMicrocents ?? 0;
      const trees = parseTrees(call.text) ?? {};
      const proposed = new Map<string, CompositionTree>();
      for (const [id, tree] of best) {
        const section = input.sections.find((candidate) => candidate.id === id);
        const mediaRefs = section ? mediaRefsFor(section, input.parts) : new Set<string>();
        const checked = validateComposition(trees[id], {
          screenText: input.screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        // A revision must keep the section's working form/contact widget; a
        // reviewer note must never be able to remove the booking form.
        let keep = checked.ok;
        if (checked.ok && section) {
          const widgetName = requiredWidgetForRole(section.kind);
          if (widgetName) {
            const widget = findWidget(checked.tree.root, widgetName);
            if (!widget || widgetPresentationProblem(section.kind, widget)) keep = false;
          }
        }
        proposed.set(id, keep && checked.ok ? checked.tree : tree);
      }
      const gate = await runImprovementGate({
        organizationId: input.organizationId,
        context: `Website sections. Supplied material: ${material}`,
        current,
        proposed: Object.fromEntries(proposed),
      });
      input.result.costMicrocents += gate.costMicrocents;
      if (gate.model) input.result.models.push(gate.model);
      const { costMicrocents: _cost, ...report } = gate;
      input.result.gateReports.push(report);
      if (!gate.accepted) break;

      // Re-run the renderer/primitive validator after the improvement gate as
      // the final commit boundary. The gate can assess quality, but it must
      // never become a path around the composition safety contract.
      let commitSafe = true;
      for (const [id, tree] of proposed) {
        const section = input.sections.find((candidate) => candidate.id === id);
        const mediaRefs = section ? mediaRefsFor(section, input.parts) : new Set<string>();
        const finalCheck = validateComposition(tree, {
          screenText: input.screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        if (!finalCheck.ok) {
          commitSafe = false;
          console.warn("team improvement rejected after final primitive validation", {
            sectionId: id,
            issues: finalCheck.issues,
          });
          break;
        }
      }
      if (!commitSafe) break;
      best = proposed;
    } catch (error) {
      console.warn("team improvement round skipped", (error as Error).message);
      break;
    }
  }
  return best;
}
