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
  safeBackdropSpec,
  type BackdropId,
  type BackdropSpec,
  type SectionEffectId,
} from "@/lib/site-effects";
import type { ContentPage } from "@/lib/website-content";
import { siteBodyFont, siteHeadingFont, siteTone } from "@/lib/site-theme";

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
  /** A background the AI composed itself (layers, colours, drift). Wins over `backdrop`. */
  backdropSpec: BackdropSpec | null;
  /**
   * Motion per section type, keyed by whatever section types the AI names.
   * There is no built-in grouping of types: a type the AI did not mention
   * gets `defaultEffect`, which the AI also chooses.
   */
  sectionEffects: Record<string, SectionEffectId>;
  defaultEffect: SectionEffectId;
};

/** The AI's effect for one section type. No type is grouped with another. */
export function effectForKind(direction: DesignDirection, kind: string): SectionEffectId {
  return direction.sectionEffects[kind] ?? direction.defaultEffect;
}

/**
 * Reads the AI's per-type effects. Also reads directions saved before this
 * change (heroEffect/ctaEffect/formEffect/bodyEffect) exactly as they were
 * saved, so existing customer sites keep the motion they already have.
 */
export function readSectionEffects(r: Record<string, unknown>): {
  sectionEffects: Record<string, SectionEffectId>;
  defaultEffect: SectionEffectId;
} {
  const sectionEffects: Record<string, SectionEffectId> = {};
  const raw = r["sectionEffects"];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [kind, value] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
      if (/^[a-z0-9_-]{1,60}$/.test(kind) && isSectionEffectId(value)) sectionEffects[kind] = value;
    }
  }
  // Compatibility reader for directions saved before per-type effects existed.
  const legacy: [string, string[]][] = [
    ["heroEffect", ["hero"]],
    ["ctaEffect", ["cta", "offer", "sticky_cta"]],
    ["formEffect", ["quote", "booking", "contact"]],
  ];
  for (const [key, kinds] of legacy) {
    const value = r[key];
    if (isSectionEffectId(value)) for (const kind of kinds) sectionEffects[kind] ??= value;
  }
  const fallback = r["defaultEffect"] ?? r["bodyEffect"];
  return { sectionEffects, defaultEffect: isSectionEffectId(fallback) ? fallback : "none" };
}

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
  const rawFont = typeof r["font"] === "string" ? r["font"] : null;
  const heading = siteHeadingFont(rawFont);
  if (!heading) return null;
  // Keep the AI's full "Heading|Body" pairing. Dropping the body face made
  // every customer site fall back to the platform's own body font.
  const bodyFace =
    siteBodyFont(rawFont) ?? siteHeadingFont(typeof r["bodyFont"] === "string" ? r["bodyFont"] : null);
  const font = bodyFace && bodyFace !== heading ? `${heading}|${bodyFace}` : heading;
  const name = cleanText(r["name"], 60);
  if (!name) return null;
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
    backdropSpec: safeBackdropSpec(r["backdropSpec"]),
    ...readSectionEffects(r),
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
    {
      type: "set_backdrop",
      backdrop: direction.backdrop,
      ...(direction.backdropSpec ? { spec: direction.backdropSpec } : {}),
    },
  ];

  const sections = pages
    .filter((page) => page.is_visible)
    .flatMap((page) => page.sections.filter((section) => section.is_visible))
    .slice(0, 40);

  for (const section of sections) {
    const effect = effectForKind(direction, section.kind);
    actions.push({ type: "set_section_effect", sectionId: section.id, effect });
  }

  return actions;
}

/** Whether a direction renders as a light (white/pale) or dark website. */
export function directionTone(direction: DesignDirection): "light" | "dark" {
  return siteTone(direction.secondary);
}
