/**
 * AI-authored design direction (pure layer).
 *
 * There is no built-in library of looks. The design model writes every value
 * here itself — colours, font, background and section motion. This module only
 * checks that what came back is safe to render, and turns it into ordinary
 * reversible agent actions. It never picks, ranks or substitutes a look.
 */

import type { AgentAction } from "@/lib/site-agent";
import {
  isBackdropId,
  isSectionEffectId,
  type BackdropId,
  type SectionEffectId,
} from "@/lib/site-effects";
import type { ContentPage } from "@/lib/website-content";
import { siteHeadingFont, siteTone } from "@/lib/site-theme";

export type DesignDirection = {
  id: string;
  name: string;
  /** One line the owner understands. */
  mood: string;
  bestFor: string;
  primary: string;
  secondary: string;
  accent: string;
  font: string;
  fontNote: string;
  backdrop: BackdropId;
  heroEffect: SectionEffectId;
  ctaEffect: SectionEffectId;
  formEffect: SectionEffectId;
  bodyEffect: SectionEffectId;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[<>{}]/g, "").trim().slice(0, max) : "";

const slugOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/**
 * Validates a direction the AI wrote. Returns null when a required value is
 * missing or unsafe — the caller then asks the next model, never a preset.
 * Effects the renderer cannot draw become "none" (no motion), not a choice.
 */
export function parseAuthoredDirection(raw: unknown): DesignDirection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const primary = typeof r["primary"] === "string" ? r["primary"] : "";
  const secondary = typeof r["secondary"] === "string" ? r["secondary"] : "";
  const accent = typeof r["accent"] === "string" ? r["accent"] : "";
  if (!HEX.test(primary) || !HEX.test(secondary) || !HEX.test(accent)) return null;
  const font = siteHeadingFont(typeof r["font"] === "string" ? r["font"] : null);
  if (!font) return null;
  const name = cleanText(r["name"], 60);
  if (!name) return null;
  const effect = (value: unknown): SectionEffectId => (isSectionEffectId(value) ? value : "none");
  return {
    id: slugOf(name) || "authored",
    name,
    mood: cleanText(r["mood"], 200),
    bestFor: cleanText(r["bestFor"], 120),
    primary,
    secondary,
    accent,
    font,
    fontNote: cleanText(r["fontNote"], 80),
    backdrop: isBackdropId(r["backdrop"]) ? r["backdrop"] : "none",
    heroEffect: effect(r["heroEffect"]),
    ctaEffect: effect(r["ctaEffect"]),
    formEffect: effect(r["formEffect"]),
    bodyEffect: effect(r["bodyEffect"]),
  };
}

/** The exact, reversible changes that installing an authored direction makes. */
export function directionActions(direction: DesignDirection, pages: ContentPage[]): AgentAction[] {
  const actions: AgentAction[] = [
    {
      type: "set_theme",
      patch: {
        primary_color: direction.primary,
        secondary_color: direction.secondary,
        accent_color: direction.accent,
        font_preference: direction.font,
      },
    },
    { type: "set_backdrop", backdrop: direction.backdrop },
  ];

  const sections = pages
    .filter((page) => page.is_visible)
    .flatMap((page) => page.sections.filter((section) => section.is_visible))
    .slice(0, 40);

  for (const section of sections) {
    const effect =
      section.kind === "hero"
        ? direction.heroEffect
        : section.kind === "cta" || section.kind === "sticky_cta" || section.kind === "offer"
          ? direction.ctaEffect
          : section.kind === "quote" || section.kind === "booking" || section.kind === "contact"
            ? direction.formEffect
            : direction.bodyEffect;
    actions.push({ type: "set_section_effect", sectionId: section.id, effect });
  }

  return actions;
}

/** Whether a direction renders as a light (white/pale) or dark website. */
export function directionTone(direction: DesignDirection): "light" | "dark" {
  return siteTone(direction.secondary);
}
