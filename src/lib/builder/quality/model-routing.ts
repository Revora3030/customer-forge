/**
 * QP-4 · Model routing hooks.
 *
 * Maps each quality-pipeline step to one of the builder's existing `ModelRole`s. The roles already decide the
 * real models (see `src/lib/ai/config.ts`, overridable with `AI_LOVABLE_MODEL_<ROLE>`), so this adds no provider,
 * no model id and no key. Stronger roles go to planning and copy, cheaper roles to the checks.
 *
 * Pure. Set `QP_STEP_ROLE_<STEP>` (for example `QP_STEP_ROLE_REVIEW=vision`) to move one step to another existing role.
 */
import type { ModelRole } from "@/lib/ai/config";

type Env = Readonly<Record<string, string | undefined>>;
const processEnv = (): Env => (typeof process !== "undefined" ? process.env : {});

export const QUALITY_STEPS = ["plan", "copy", "layout", "review", "facts-check", "lint", "repair"] as const;
export type QualityStep = (typeof QUALITY_STEPS)[number];

/** Whether a step needs the strongest roster or is fine on the cheaper one. */
export type RoutingTier = "strong" | "standard" | "cheap";

export const STEP_ROUTING: Readonly<Record<QualityStep, { role: ModelRole; tier: RoutingTier; why: string }>> = {
  plan: { role: "design", tier: "strong", why: "identity, section mix and order are creative judgement" },
  copy: { role: "primary", tier: "strong", why: "wording quality and staying inside the owner's facts" },
  layout: { role: "design", tier: "strong", why: "composition, motion and hierarchy" },
  review: { role: "fast", tier: "cheap", why: "a checklist read of a finished draft" },
  "facts-check": { role: "fast", tier: "cheap", why: "mechanical comparison against intake" },
  lint: { role: "fast", tier: "cheap", why: "pattern checks, normally no model at all" },
  repair: { role: "coding", tier: "standard", why: "targeted fix of one failed part" },
};

const ROLES: readonly ModelRole[] = ["primary", "design", "fast", "vision", "coding", "image", "transcription", "conversation"];
const isRole = (value: string | undefined): value is ModelRole => !!value && (ROLES as readonly string[]).includes(value);

/** The role a step runs on. A valid `QP_STEP_ROLE_<STEP>` override wins, otherwise the table above. */
export function roleForStep(step: QualityStep, env: Env = processEnv()): ModelRole {
  const key = `QP_STEP_ROLE_${step.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const override = env[key]?.trim();
  return isRole(override) ? override : STEP_ROUTING[step].role;
}

/** The whole routing table, for logs and the learning loop. */
export function routingTable(env: Env = processEnv()): Record<QualityStep, ModelRole> {
  return Object.fromEntries(QUALITY_STEPS.map((step) => [step, roleForStep(step, env)])) as Record<QualityStep, ModelRole>;
}
