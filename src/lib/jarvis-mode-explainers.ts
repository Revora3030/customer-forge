/**
 * JC-40: one-line "what this does" under Brief / Balanced / Deep.
 * Credits / cost lines appear only when a measured amount is passed in —
 * never invent a dollar or credit figure from the reply-length caps.
 */
export type JarvisModeId = "brief" | "balanced" | "deep";

export type ModeExplainer = {
  id: JarvisModeId;
  label: string;
  /** Plain-English what the mode does (always shown). */
  does: string;
};

/** Owner-facing copy aligned with MODE_CONFIG rules in jarvis.functions.ts. */
export const JARVIS_MODE_EXPLAINERS: Record<JarvisModeId, ModeExplainer> = {
  brief: {
    id: "brief",
    label: "Brief",
    does: "Short answer — about 120 words, no preamble.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    does: "Bottom line first, then evidence and ranked actions.",
  },
  deep: {
    id: "deep",
    label: "Deep",
    does: "Full plan with trade-offs, steps, risks, and a draft when useful.",
  },
};

/**
 * One line under a mode in the Response style menu.
 * `measuredCredits` is optional live copy (e.g. "Uses ~2 credits") — omit or null when unmeasured.
 */
export function modeExplainerLine(mode: JarvisModeId, measuredCredits?: string | null): string {
  const does = JARVIS_MODE_EXPLAINERS[mode]?.does ?? JARVIS_MODE_EXPLAINERS.balanced.does;
  const credits = typeof measuredCredits === "string" ? measuredCredits.trim() : "";
  return credits ? `${does} ${credits}` : does;
}

export function isJarvisModeId(value: unknown): value is JarvisModeId {
  return value === "brief" || value === "balanced" || value === "deep";
}
