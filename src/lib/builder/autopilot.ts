/**
 * REVORA AUTOPILOT INTELLIGENCE
 *
 * Converts vague outcome requests into deterministic builder intent without
 * introducing an AI/network dependency. This layer is deliberately additive:
 * the existing interpreter, compiler, executor, auth, persistence and safety
 * boundaries remain authoritative.
 */
import type { AgentContext } from "@/lib/site-agent.server";
import type { BuilderIntent, BuilderGoal, BuilderVerb, StyleMood } from "./interpreter";

export type SiteDiagnosis = {
  pages: number;
  sections: number;
  missingHomeHero: boolean;
  missingPrimaryCta: boolean;
  missingTrust: boolean;
  missingFaq: boolean;
  missingServices: boolean;
  missingContact: boolean;
  missingMobileCta: boolean;
  weakCopyCount: number;
  duplicateSectionKinds: string[];
  completeness: number;
  conversionReadiness: number;
  contentReadiness: number;
};

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

const hasAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

/** Diagnose the existing site using only persisted workspace facts. */
export function diagnoseSite(context: AgentContext): SiteDiagnosis {
  const pages = context.pages ?? [];
  const sections = pages.flatMap((page) => page.sections ?? []);
  const home = pages.find((page) => page.kind === "home") ?? pages[0];
  const homeSections = home?.sections ?? [];
  const kinds = new Set(sections.map((section) => section.kind));
  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.kind, (counts.get(section.kind) ?? 0) + 1);

  const weakCopyCount = sections.filter((section) => {
    const text = [section.heading, section.subheading, section.body].filter(Boolean).join(" ").trim();
    return text.length < 24;
  }).length;

  const duplicateSectionKinds = [...counts.entries()]
    .filter(([, count]) => count >= Math.max(3, pages.length + 1))
    .map(([kind]) => kind);

  const missing = (kind: string) => !kinds.has(kind);
  const missingHomeHero = !homeSections.some((section) => section.kind === "hero");
  const missingPrimaryCta = !sections.some((section) =>
    section.components?.some((component) => component.kind === "button"),
  );

  const completeness = Math.round(
    Math.max(0, Math.min(100, 100 - (missingHomeHero ? 12 : 0) - (missing("services") ? 10 : 0) - (missing("contact") ? 8 : 0) - (missing("faq") ? 5 : 0) - (missing("reviews") ? 5 : 0) - Math.min(20, weakCopyCount * 2))),
  );

  const conversionReadiness = Math.round(
    Math.max(0, Math.min(100, 100 - (missingPrimaryCta ? 25 : 0) - (missing("booking") && missing("quote") && missing("contact") ? 20 : 0) - (missing("trust_bar") && missing("reviews") ? 15 : 0) - (missing("faq") ? 8 : 0))),
  );

  const contentReadiness = Math.round(Math.max(0, Math.min(100, 100 - Math.min(45, weakCopyCount * 3))));

  return {
    pages: pages.length,
    sections: sections.length,
    missingHomeHero,
    missingPrimaryCta,
    missingTrust: missing("trust_bar") && missing("reviews"),
    missingFaq: missing("faq"),
    missingServices: missing("services"),
    missingContact: missing("contact"),
    missingMobileCta: missing("sticky_cta"),
    weakCopyCount,
    duplicateSectionKinds,
    completeness,
    conversionReadiness,
    contentReadiness,
  };
}

/**
 * Infer intent from outcome language that is intentionally too broad for a
 * keyword-only interpreter. Existing explicit intent always wins.
 */
export function applyAutopilot(context: AgentContext, instruction: string, intent: BuilderIntent): BuilderIntent {
  const text = instruction.toLowerCase().replace(/\s+/g, " ").trim();
  const diagnosis = diagnoseSite(context);
  const goals = [...intent.goals];
  const verbs = [...intent.verbs];
  const moods = [...intent.moods];
  const constraints = [...intent.constraints];
  const notes = [...intent.unrecognised];

  const addGoal = (goal: BuilderGoal) => { if (!goals.includes(goal)) goals.push(goal); };
  const addVerb = (verb: BuilderVerb) => { if (!verbs.includes(verb)) verbs.push(verb); };
  const addMood = (mood: StyleMood) => { if (!moods.includes(mood)) moods.push(mood); };

  const vagueImprove = hasAny(text, [
    "make it better", "make my website better", "improve my website", "improve the site",
    "make this better", "make everything better", "fix whatever is wrong", "fix everything",
    "make it good", "make it great", "make this great", "upgrade my website",
    "make my site professional", "make my website professional",
  ]);

  const growthRequest = hasAny(text, [
    "get more customers", "get more clients", "get more leads", "get more calls",
    "get more bookings", "grow my business", "sell more", "convert more", "more business",
  ]);

  const premiumRequest = hasAny(text, [
    "look expensive", "look high end", "look high-end", "look premium", "look amazing",
    "look incredible", "look modern", "make it pop", "wow me", "not generic", "less plain",
  ]);

  const mobileRequest = hasAny(text, ["mobile", "phone", "on my phone", "responsive", "works everywhere"]);

  const sitewideRequest = hasAny(text, ["whole site", "entire site", "every page", "all pages", "everything", "across the site"]);

  if (vagueImprove) {
    addVerb("fix");
    addVerb("hierarchy");
    addGoal("redesign");
    addGoal("conversion");
    addGoal("mobile");
    addGoal("visual");
    addMood("modern");
    if (sitewideRequest || diagnosis.pages > 1) {
      intent.wholeSite = true;
      intent.everyPage = true;
    }
  }

  if (growthRequest) {
    addVerb("cta");
    addVerb("hierarchy");
    addGoal("conversion");
    addGoal("leads");
    if (hasAny(text, ["calls", "phone"])) addGoal("calls");
    if (hasAny(text, ["booking", "bookings", "appointments"])) addGoal("booking");
  }

  if (premiumRequest) {
    addVerb("restyle");
    addGoal("visual");
    addMood("premium");
    addMood("modern");
  }

  if (mobileRequest) {
    addVerb("mobile");
    addGoal("mobile");
    constraints.push("mobile_first");
  }

  if (sitewideRequest) {
    intent.wholeSite = true;
    intent.everyPage = true;
  }

  // If the owner asks for a broad improvement, prioritize real weaknesses
  // discovered from the site instead of inventing content.
  if (vagueImprove || growthRequest) {
    if (diagnosis.missingPrimaryCta) addGoal("conversion");
    if (diagnosis.missingServices) notes.push("Autopilot detected a missing services area from the existing site.");
    if (diagnosis.missingFaq) notes.push("Autopilot detected an opportunity for an FAQ section; answers must remain factual.");
    if (diagnosis.missingTrust) notes.push("Autopilot detected limited trust/proof structure; real proof only.");
    if (diagnosis.weakCopyCount > 0) addVerb("rewrite");
  }

  return {
    ...intent,
    verbs: unique(verbs),
    goals: unique(goals),
    moods: unique(moods),
    constraints: unique(constraints),
    unrecognised: unique(notes),
    visualIntensity: Math.max(intent.visualIntensity, premiumRequest ? 2 : 0) as 0 | 1 | 2 | 3,
    carried: intent.carried,
  };
}

/** Human-readable quality snapshot for the builder UI / plan trace. */
export function autopilotSummary(diagnosis: SiteDiagnosis): string {
  return `Site readiness: ${diagnosis.completeness}/100; conversion: ${diagnosis.conversionReadiness}/100; content: ${diagnosis.contentReadiness}/100.`;
}
