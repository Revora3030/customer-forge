import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import { readBlockStyle } from "@/lib/site-style";

/** Corrects a common customer typo without changing the words shown in chat. */
export function normalizeBuilderInstruction(instruction: string): string {
  if (!/\bfronts?\b/i.test(instruction)) return instruction;
  if (!/\b(?:background|colou?r|style|typeface|typography)\b/i.test(instruction)) return instruction;
  return `${instruction}\n\nINTERPRETATION NOTE: In this styling request, “front/fronts” means “font/fonts”, not foreground colour.`;
}

/**
 * A global theme sits underneath section overrides. Whenever the planner uses
 * set_theme for a colour request, update those overrides too so the saved
 * result is visible. Scoped requests use set_block_style and never enter here.
 */
export function ensureRequestedCoverage(
  instruction: string,
  actions: AgentAction[],
  context: AgentContext,
): AgentAction[] {
  if (!/\b(?:background|colou?r|palette|theme)\b/i.test(instruction)) return actions;
  const theme = actions.find((action) => action.type === "set_theme");
  if (!theme || theme.type !== "set_theme") return actions;
  const background = theme.patch.secondary_color;
  const foreground = theme.patch.primary_color;
  if (!background && !foreground) return actions;

  const alreadyStyled = new Set(
    actions
      .filter((action): action is Extract<AgentAction, { type: "set_block_style" }> => action.type === "set_block_style")
      .map((action) => `${action.target}:${action.targetId}:${action.device}`),
  );
  const expanded = [...actions];
  for (const page of context.pages) {
    if (!page.is_visible) continue;
    for (const section of page.sections) {
      if (!section.is_visible || alreadyStyled.has(`section:${section.id}:desktop`)) continue;
      const style = readBlockStyle(section.settings, "desktop");
      if (!style.bgColor && !style.bgGradient) continue;
      expanded.push({
        type: "set_block_style",
        target: "section",
        targetId: section.id,
        device: "desktop",
        patch: {
          ...(background ? { bgColor: background, bgGradient: null } : {}),
          ...(foreground ? { textColor: foreground } : {}),
        },
      });
    }
  }
  return expanded.slice(0, 60);
}

export function coveredRequestDimensions(instruction: string, actions: AgentAction[]) {
  const requested = {
    font: /\b(?:font|fonts|typeface|typography|front|fronts)\b/i.test(instruction),
    color: /\b(?:background|foreground|text colou?r|palette|theme|colou?r)\b/i.test(instruction),
    image: /\b(?:image|images|picture|pictures|photo|photos)\b/i.test(instruction),
  };
  const covered = {
    font: actions.some(
      (action) =>
        (action.type === "set_theme" && Boolean(action.patch.font_preference)) ||
        (action.type === "set_block_style" && Boolean(action.patch.font)),
    ),
    color: actions.some(
      (action) =>
        action.type === "set_theme" ||
        (action.type === "set_block_style" &&
          Boolean(action.patch.bgColor || action.patch.bgGradient || action.patch.textColor)),
    ),
    image: actions.some((action) => action.type === "generate_component_image"),
  };
  return Object.entries(requested)
    .filter(([, wanted]) => wanted)
    .map(([dimension]) => ({
      label: `${dimension} change`,
      covered: covered[dimension as keyof typeof covered],
    }));
}