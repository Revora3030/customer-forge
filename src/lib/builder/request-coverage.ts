import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

/** Corrects a common customer typo without changing the words shown in chat. */
export function normalizeBuilderInstruction(instruction: string): string {
  if (!/\bfronts?\b/i.test(instruction)) return instruction;
  if (!/\b(?:background|colou?r|style|typeface|typography)\b/i.test(instruction)) return instruction;
  return `${instruction}\n\nINTERPRETATION NOTE: In this styling request, “front/fronts” means “font/fonts”, not foreground colour.`;
}

/**
 * Coverage is now observational, not generative. The AI is the authority for
 * choosing which concrete targets to change. This helper deliberately never
 * synthesizes extra actions from a request because doing so would reintroduce
 * deterministic creative authority after Sol has authored the plan.
 */
export function ensureRequestedCoverage(
  _instruction: string,
  actions: AgentAction[],
  _context: AgentContext,
): AgentAction[] {
  return actions;
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
        (action.type === "set_block_style" && Boolean(action.patch.font)) ||
        action.type === "set_ai_visual",
    ),
    color: actions.some(
      (action) =>
        action.type === "set_theme" ||
        action.type === "set_ai_visual" ||
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
