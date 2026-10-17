export type FreeOnlyEnvironment = Readonly<Record<string, string | undefined>>;

const FLAGS = ["AI_FREE_ONLY", "FREE_AI_ONLY", "ZERO_COST_ONLY"] as const;
const EXPLICIT_OFF = new Set(["false", "0", "no", "off"]);

/** Invalid/conflicting flags cannot enable paid routing. Eligibility is a separate gate. */
export function freeAiOnly(environment: FreeOnlyEnvironment = process.env): boolean {
  const declared = FLAGS.map((name) => environment[name]).filter(
    (value): value is string => value !== undefined,
  );
  return declared.length === 0 || declared.some((value) => !EXPLICIT_OFF.has(value.trim().toLowerCase()));
}

/**
 * Builder steps hard enough to be worth paid models (the owner chose "paid for
 * the hardest steps, up to a daily cap"): planning, design and content
 * direction, and the QA reviews. High-volume steps (metadata, SEO, rewrites,
 * classification) stay on the free pool.
 */
export const PAID_PURPOSES: ReadonlySet<string> = new Set([
  "creative_direction",
  "information_architecture",
  "conversion_architecture",
  "content_strategy",
  "content_strategy_targeted_revision",
  "plan_review",
  "page_planning",
  "adversarial_review",
  "specialist_review",
  "quality_review",
  "final_review",
  "whole_site_review",
  "deep_conversion_audit",
  "hard_request",
]);

const EXPLICIT_ON = new Set(["true", "1", "yes", "on"]);

/**
 * May this builder step use the paid collective? Paid is allowed by default
 * for the hardest steps while the daily cap is above $0 (the cap itself is
 * enforced per call by paid-budget.server). Setting any free-only flag to
 * true forces free-only; turning every flag explicitly off allows paid for
 * every purpose, as before.
 */
export function paidCollectiveAllowed(
  purpose: string,
  environment: FreeOnlyEnvironment = process.env,
): boolean {
  const declared = FLAGS.map((name) => environment[name]?.trim().toLowerCase()).filter(
    (value): value is string => value !== undefined && value !== "",
  );
  if (declared.some((value) => EXPLICIT_ON.has(value))) return false;
  if (!freeAiOnly(environment)) return true;
  if (declared.some((value) => !EXPLICIT_OFF.has(value))) return false;
  const cap = environment["AI_PAID_DAILY_CAP_USD"]?.trim();
  const capOn = !cap || (Number.isFinite(Number(cap)) && Number(cap) > 0);
  return capOn && PAID_PURPOSES.has(purpose);
}
