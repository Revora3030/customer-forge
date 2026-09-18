/**
 * REVORA VISUAL COMPOSITION INTELLIGENCE
 * ======================================
 *
 * Turns a coordinated design direction into bounded section-level composition
 * decisions. The planner only targets sections that already exist and uses the
 * finite visual vocabulary supported by the site-agent contract.
 */

import type { AgentAction, SectionVisualPatch } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import type { StyleMood } from "./interpreter";

type Section = AgentContext["pages"][number]["sections"][number];

const requestedVisual = (instruction: string, moods: StyleMood[], intensity: number): boolean =>
  intensity > 0 ||
  moods.length > 0 ||
  /\b(visual|design|redesign|restyle|layout|look|premium|modern|beautiful|polished)\b/i.test(instruction);

function sectionPriority(section: Section): number {
  switch (section.kind) {
    case "hero": return 100;
    case "trust_bar": return 92;
    case "offer": return 88;
    case "services": return 84;
    case "gallery": return 82;
    case "reviews": return 78;
    case "benefits": return 76;
    case "pricing": return 74;
    case "process": return 70;
    case "faq": return 60;
    case "cta": return 56;
    case "contact": return 52;
    default: return 40;
  }
}

function sectionPatch(section: Section, moods: StyleMood[], intensity: number): SectionVisualPatch | null {
  const moodSet = new Set(moods);
  const premium = moodSet.has("premium");
  const modern = moodSet.has("modern");
  const bold = moodSet.has("bold");
  const minimal = moodSet.has("minimal");
  const friendly = moodSet.has("friendly");
  const dark = moodSet.has("dark");

  if (section.kind === "hero") {
    return {
      layout: premium || modern || bold ? "layered" : "split",
      density: minimal ? "dense" : bold || premium ? "airy" : "balanced",
      image_position: "right",
      image_treatment: premium || dark ? "cinematic" : modern ? "glass_frame" : "rounded",
      spacing: minimal ? "tight" : "generous",
      max_width: bold || premium ? "wide" : "standard",
      card_style: premium || dark ? "glass" : friendly ? "soft" : "floating",
      image_ratio: bold ? "21:9" : "16:9",
    };
  }

  if (["services", "benefits", "offer", "pricing"].includes(section.kind)) {
    return {
      layout: modern || premium ? "editorial" : "stacked",
      density: minimal ? "dense" : "balanced",
      spacing: premium ? "generous" : "standard",
      max_width: "wide",
      card_style: premium || dark ? "glass" : friendly ? "soft" : bold ? "floating" : "sharp",
    };
  }

  if (["gallery", "reviews"].includes(section.kind)) {
    return {
      layout: modern || premium ? "editorial" : "stacked",
      density: intensity >= 2 ? "airy" : "balanced",
      spacing: "generous",
      max_width: "wide",
      card_style: premium || dark ? "glass" : "soft",
      image_ratio: "4:3",
    };
  }

  if (["trust_bar", "process", "faq", "contact", "cta"].includes(section.kind)) {
    return {
      layout: section.kind === "cta" && bold ? "full_bleed" : "centered",
      density: minimal ? "dense" : "balanced",
      spacing: bold || premium ? "generous" : "standard",
      max_width: section.kind === "trust_bar" ? "edge" : "standard",
      card_style: dark || premium ? "glass" : friendly ? "soft" : "sharp",
    };
  }

  return null;
}

/** Creates bounded visual composition actions for existing sections. */
export function compileVisualComposition(
  context: AgentContext,
  instruction: string,
  moods: StyleMood[],
  intensity: number,
  limit = 8,
): AgentAction[] {
  if (!requestedVisual(instruction, moods, intensity)) return [];

  const pageCandidates = context.pages
    .filter((page) => page.is_visible && !page.noindex)
    .sort((a, b) => Number(a.kind !== "home") - Number(b.kind !== "home"));

  const sections = pageCandidates
    .flatMap((page) => page.sections.map((section) => ({ page, section })))
    .sort((a, b) => sectionPriority(b.section) - sectionPriority(a.section));

  const seen = new Set<string>();
  const actions: AgentAction[] = [];

  for (const { section } of sections) {
    if (actions.length >= Math.max(1, Math.min(limit, 12))) break;
    if (seen.has(section.id)) continue;

    const patch = sectionPatch(section, moods, intensity);
    if (!patch) continue;

    seen.add(section.id);
    actions.push({ type: "set_section_visual", sectionId: section.id, patch });
  }

  return actions;
}

export function visualCompositionSummary(actions: AgentAction[]): string {
  const count = actions.filter((action) => action.type === "set_section_visual").length;
  return count === 0
    ? "Visual composition intelligence found no supported existing sections to refine."
    : "Visual composition intelligence prepared " + count + " existing section" +
      (count === 1 ? "" : "s") +
      " for coordinated layout, spacing and media treatment.";
}
