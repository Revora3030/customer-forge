/**
 * AI team authority map (spec B).
 *
 * One declarative source for who owns which decision, and what a fallback is
 * allowed to be. The router, image lanes and reviewers already implement the
 * mechanics (capability gate, circuit breakers, retry budgets, telemetry with
 * requestId/provider/model/latency/fallbackUsed). This module pins the policy
 * those mechanics must respect, so it can be asserted in tests and shown in
 * admin views.
 *
 * Fallback policy: a fallback may only move to a model that is verified for
 * the same capability, currently available, and not paid when the lane is
 * free-only. Anything else is an explicit "unavailable" result, never a silent
 * downgrade.
 */
import type { ModelCapability } from "@/lib/ai/registry.server";

export type TeamMember = "sol" | "terra" | "luna" | "sunburst" | "flare" | "sora";

export type TeamRole = {
  member: TeamMember;
  title: string;
  /** Decisions this member has final authority over. */
  owns: readonly string[];
  /** Capabilities a model must be verified for to act in this role. */
  capabilities: readonly ModelCapability[];
  /** When the role may be used at all. */
  when: "always" | "images_requested" | "motion_improves_experience";
};

export const AI_TEAM: Record<TeamMember, TeamRole> = {
  sol: {
    member: "sol",
    title: "Creative director (final creative authority)",
    owns: ["visual composition", "brand direction", "layout", "typography", "color system", "hierarchy", "imagery direction", "customer-site creative decisions"],
    capabilities: ["design", "frontend", "copy", "planning"],
    when: "always",
  },
  terra: {
    member: "terra",
    title: "Adversarial reviewer",
    owns: ["responsive behavior", "visual quality", "accessibility", "layout defects", "broken interactions", "overflow", "image distortion", "regressions"],
    capabilities: ["critique", "qa", "accessibility", "vision"],
    when: "always",
  },
  luna: {
    member: "luna",
    title: "Truth, conversion and SEO validator",
    owns: ["truthfulness", "business facts", "conversion paths", "SEO", "metadata", "structured data", "analytics semantics"],
    capabilities: ["facts", "seo", "cro"],
    when: "always",
  },
  sunburst: {
    member: "sunburst",
    title: "Premium image art direction",
    owns: ["hero and editorial imagery", "precision edits"],
    capabilities: ["image"],
    when: "images_requested",
  },
  flare: {
    member: "flare",
    title: "Supporting image generation",
    owns: ["supporting photos", "iterations", "variations"],
    capabilities: ["image"],
    when: "images_requested",
  },
  sora: {
    member: "sora",
    title: "Motion (only when it demonstrably helps)",
    owns: ["cinematic motion"],
    capabilities: ["image"],
    when: "motion_improves_experience",
  },
};

export type FallbackCandidate = {
  model: string;
  capabilities: readonly ModelCapability[];
  available: boolean;
  /** True when the model costs money. */
  paid: boolean;
  /** True only when a real capability check/benchmark verified it. */
  verified: boolean;
};

export type FallbackDecision =
  | { ok: true; model: string; reason: string }
  | { ok: false; reason: string };

/**
 * Chooses a fallback for a role, or refuses. Never returns a model that is
 * unverified, unavailable, missing a required capability, or paid on a
 * free-only lane. The refusal reason is meant to be logged and surfaced.
 */
export function chooseFallback(
  member: TeamMember,
  candidates: readonly FallbackCandidate[],
  options: { freeOnly: boolean; failedModel: string; failureReason: string },
): FallbackDecision {
  const role = AI_TEAM[member];
  const rejected: string[] = [];
  for (const candidate of candidates) {
    if (candidate.model === options.failedModel) continue;
    const missing = role.capabilities.filter((cap) => !candidate.capabilities.includes(cap));
    if (!candidate.verified) rejected.push(`${candidate.model}: unverified`);
    else if (!candidate.available) rejected.push(`${candidate.model}: unavailable`);
    else if (options.freeOnly && candidate.paid) rejected.push(`${candidate.model}: paid on a free-only lane`);
    else if (missing.length) rejected.push(`${candidate.model}: lacks ${missing.join(", ")}`);
    else
      return {
        ok: true,
        model: candidate.model,
        reason: `${role.title}: ${options.failedModel} failed (${options.failureReason}); using verified ${candidate.model}`,
      };
  }
  return {
    ok: false,
    reason: `${role.title}: no verified, available fallback after ${options.failedModel} failed (${options.failureReason})${rejected.length ? ` — rejected ${rejected.join("; ")}` : ""}`,
  };
}
