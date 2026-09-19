import type { AgentAction, SectionVisualPatch, ThemePatch } from "@/lib/site-agent";
import type { DesignDirection } from "@/lib/design-directions";

export type DesignSystemContract = {
  theme: ThemePatch;
  backdrop: DesignDirection["backdrop"];
  heroEffect: DesignDirection["heroEffect"];
  ctaEffect: DesignDirection["ctaEffect"];
  formEffect: DesignDirection["formEffect"];
  bodyEffect: DesignDirection["bodyEffect"];
};

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  if (!HEX.test(hex)) return 0.18;
  const rgb = hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function normalizeDesignSystem(direction: DesignDirection): DesignSystemContract {
  const contrast = contrastRatio(direction.primary, direction.secondary);
  const primary = contrast < 2.5 ? direction.accent : direction.primary;
  return {
    theme: { primary_color: primary, secondary_color: direction.secondary, accent_color: direction.accent, font_preference: direction.font },
    backdrop: direction.backdrop,
    heroEffect: direction.heroEffect,
    ctaEffect: direction.ctaEffect,
    formEffect: direction.formEffect,
    bodyEffect: direction.bodyEffect,
  };
}

export function sectionVisualForKind(kind: string, dark: boolean): SectionVisualPatch {
  const base = dark
    ? { card_style: "glass" as const, max_width: "wide" as const, spacing: "generous" as const }
    : { card_style: "soft" as const, max_width: "wide" as const, spacing: "generous" as const };
  switch (kind) {
    case "hero": return { ...base, layout: "layered", density: "airy", image_position: "right", image_treatment: dark ? "cinematic" : "rounded", image_ratio: "16:9" };
    case "services":
    case "benefits": return { ...base, layout: "editorial", density: "balanced" };
    case "gallery":
    case "portfolio": return { ...base, layout: "editorial", density: "airy", image_treatment: "soft_shadow", image_ratio: "4:3" };
    case "reviews": return { ...base, layout: "editorial", density: "balanced", card_style: dark ? "glass" : "editorial" };
    case "pricing": return { ...base, layout: "centered", density: "balanced", card_style: dark ? "floating" : "soft" };
    case "cta":
    case "offer":
    case "sticky_cta": return { ...base, layout: "full_bleed", density: "airy", card_style: dark ? "glass" : "floating" };
    case "contact":
    case "booking":
    case "quote": return { ...base, layout: "split", density: "balanced", card_style: dark ? "glass" : "soft" };
    case "faq": return { ...base, layout: "centered", density: "balanced", max_width: "standard" };
    default: return { ...base, layout: "centered", density: "balanced" };
  }
}

export function compileDesignSystemActions(
  sections: Array<{ id: string; kind: string }>,
  direction: DesignDirection,
  cap: number,
): AgentAction[] {
  const system = normalizeDesignSystem(direction);
  const actions: AgentAction[] = [
    { type: "set_theme", patch: system.theme },
    { type: "set_backdrop", backdrop: system.backdrop },
  ];
  const dark = direction.secondary !== "#ffffff" && !/^#f/i.test(direction.secondary);
  for (const section of sections) {
    if (actions.length >= cap) break;
    actions.push({ type: "set_section_visual", sectionId: section.id, patch: sectionVisualForKind(section.kind, dark) });
    if (actions.length >= cap) break;
    const effect = section.kind === "hero" ? system.heroEffect : section.kind === "cta" || section.kind === "offer" ? system.ctaEffect : section.kind === "booking" || section.kind === "contact" || section.kind === "quote" ? system.formEffect : system.bodyEffect;
    actions.push({ type: "set_section_effect", sectionId: section.id, effect });
  }
  return actions.slice(0, cap);
}
