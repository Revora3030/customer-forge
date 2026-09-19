import type { AgentAction, VisualComponentPatch } from "@/lib/site-agent";

const MEDIA_KINDS = new Set(["image", "gallery", "media", "photo", "hero_image", "logo"]);

export type ImageQualitySignals = { hasMedia: boolean; missingAlt: number; missingFocalPoint: number; poorAspectCount: number };

export function imageQualitySignals(components: Array<{ kind: string; label?: string | null; settings?: unknown; media_url?: string | null }>): ImageQualitySignals {
  const media = components.filter((c) => MEDIA_KINDS.has(c.kind));
  let missingAlt = 0, missingFocalPoint = 0, poorAspectCount = 0;
  for (const component of media) {
    const settings = component.settings && typeof component.settings === "object" ? component.settings as Record<string, unknown> : {};
    const visual = settings.visual && typeof settings.visual === "object" ? settings.visual as Record<string, unknown> : {};
    if (!String(visual.alt ?? component.label ?? "").trim()) missingAlt++;
    if (!String(visual.focal_point ?? "").trim()) missingFocalPoint++;
    if (!["1:1", "4:3", "3:2", "16:9", "21:9"].includes(String(visual.aspect_ratio ?? ""))) poorAspectCount++;
  }
  return { hasMedia: media.length > 0, missingAlt, missingFocalPoint, poorAspectCount };
}

export function compileImageQualityActions(
  sections: Array<{ id: string; kind: string; components: Array<{ id: string; kind: string; label?: string | null; media_url?: string | null }> }>,
  businessName: string,
  cap: number,
): AgentAction[] {
  const actions: AgentAction[] = [];
  for (const section of sections) {
    for (const component of section.components) {
      if (actions.length >= cap) return actions;
      if (!MEDIA_KINDS.has(component.kind)) continue;
      const patch: VisualComponentPatch = {
        alt: String(component.label ?? "").trim().slice(0, 160) || businessName + " work",
        object_fit: "cover",
        radius: section.kind === "hero" ? "large" : "medium",
        shadow: section.kind === "hero" ? "medium" : "soft",
        aspect_ratio: section.kind === "hero" ? "16:9" : "4:3",
        focal_point: "0.5 0.5",
      };
      actions.push({ type: "set_component_visual", componentId: component.id, patch });
    }
  }
  return actions;
}
