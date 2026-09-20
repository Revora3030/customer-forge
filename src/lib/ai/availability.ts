/**
 * What AI the builder can actually reach, right now, for free.
 *
 * The deterministic native engine always answers first, so this is only asked
 * when a request genuinely needs a generative model. It answers honestly per
 * capability: a free provider is "available" only when its credentials are
 * present and it has a free-eligible model for that role.
 *
 * Server-only (reads `process.env`).
 */

import {
  builderExternalAiAllowed,
  providerChain,
  zeroAiCostMode,
  type ModelRole,
} from "@/lib/ai/config";
import { freeProviderChain } from "@/lib/ai/free";

/** Free AI for one role: configured credentials plus a free-eligible model. */
export function freeAiAvailable(role: ModelRole = "primary") {
  return freeProviderChain(role).length > 0;
}

/**
 * Paid provider accounts are only reachable when an operator has explicitly
 * opted out of zero-cost mode AND switched builder-external AI on. Nothing in
 * the builder can turn this on by itself.
 */
export function paidAiAllowedForBuilder() {
  return !zeroAiCostMode() && builderExternalAiAllowed() && providerChain().length > 0;
}

/** Can the builder call a model for this role at all (free first)? */
export function builderAiAvailable(role: ModelRole = "primary") {
  return freeAiAvailable(role) || paidAiAllowedForBuilder();
}

/**
 * Honest media capability for the builder UI: vision needs a free multimodal
 * model, voice needs a free transcription model (Gemini's free tier serves one,
 * verified live) and pictures need a free text-to-image model (Cloudflare
 * Workers AI serves one inside its free allowance, verified live). Each falls
 * back to a paid account only when an operator has explicitly enabled one;
 * otherwise the capability reads off.
 */
export function builderMediaAvailability() {
  const vision = builderAiAvailable("vision");
  const voice = freeAiAvailable("transcription") || paidAiAllowedForBuilder();
  const images = freeAiAvailable("image") || paidAiAllowedForBuilder();
  return {
    vision,
    voice,
    images,
    source: freeAiAvailable("vision") ? ("free" as const) : vision ? ("paid" as const) : null,
  };
}
