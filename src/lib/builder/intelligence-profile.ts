/**
 * Deterministic builder intelligence profile.
 * Turns site facts + request intent into bounded, explainable priorities.
 */

export type IntelligencePriority =
  | "conversion"
  | "visual"
  | "mobile"
  | "content"
  | "seo"
  | "trust"
  | "accessibility"
  | "performance"
  | "structure";

export type IntelligenceProfile = {
  confidence: number;
  priorities: IntelligencePriority[];
  broad: boolean;
  autoExecute: boolean;
  reasons: string[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const has = (text: string, values: string[]) => values.some((v) => text.includes(v));

/**
 * Decide how aggressively Revora can act without asking unnecessary questions.
 * High-confidence, reversible website improvements are safe to batch.
 */
export function intelligenceProfile(input: {
  instruction: string;
  pages: number;
  sections: number;
  completeness: number;
  conversionReadiness: number;
  contentReadiness: number;
  missingMobileCta: boolean;
  missingTrust: boolean;
  missingFaq: boolean;
  missingHomeHero: boolean;
}): IntelligenceProfile {
  const text = input.instruction.toLowerCase();
  const priorities: IntelligencePriority[] = [];
  const reasons: string[] = [];

  const broad = has(text, [
    "make it better", "make my website better", "improve my website", "fix everything",
    "upgrade my website", "whole site", "entire site", "every page", "all pages",
    "get more customers", "get more leads", "get more calls", "get more bookings",
  ]);

  if (input.conversionReadiness < 85 || has(text, ["customers", "clients", "leads", "sales", "calls", "bookings", "appointments"])) {
    priorities.push("conversion");
    reasons.push("Conversion is a stated or detected business outcome.");
  }
  if (input.missingHomeHero || has(text, ["modern", "premium", "expensive", "wow", "pop", "design", "visual"])) {
    priorities.push("visual");
    reasons.push("Visual hierarchy or presentation needs attention.");
  }
  if (input.missingMobileCta || has(text, ["mobile", "phone", "responsive"])) {
    priorities.push("mobile");
    reasons.push("Mobile experience is explicitly requested or structurally incomplete.");
  }
  if (input.contentReadiness < 85 || has(text, ["rewrite", "copy", "content", "professional", "clear"])) priorities.push("content");
  if (input.completeness < 90 || has(text, ["google", "seo", "rank", "search", "local"])) priorities.push("seo");
  if (input.missingTrust || has(text, ["trust", "reviews", "testimonials", "proof"])) priorities.push("trust");
  if (input.missingFaq) priorities.push("structure");
  if (has(text, ["accessible", "accessibility", "readable", "contrast", "keyboard"])) priorities.push("accessibility");
  if (has(text, ["fast", "speed", "performance", "load"])) priorities.push("performance");

  const explicitSignals = [
    broad,
    input.pages > 0,
    input.sections > 0,
    input.completeness > 0,
    priorities.length > 0,
  ].filter(Boolean).length;

  const confidence = clamp(58 + explicitSignals * 8 + (broad ? 10 : 0));
  const autoExecute = confidence >= 75 && broad;

  if (input.pages === 0) reasons.push("No pages are available, so structural generation should wait for a valid workspace.");
  if (input.sections === 0) reasons.push("No sections are available, so the planner should avoid guessing structure.");

  return {
    confidence,
    priorities: [...new Set(priorities)].slice(0, 9),
    broad,
    autoExecute,
    reasons: [...new Set(reasons)],
  };
}
