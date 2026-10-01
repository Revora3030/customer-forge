/**
 * What AI the builder can actually reach, right now, for free.
 *
 * The validated builder execution layer remains available, so this is only asked
 * when a request genuinely needs a generative model. It answers honestly per
 * capability: a free provider is "available" only when its credentials are
 * present and it has a free-eligible model for that role.
 *
 * Server-only (reads `process.env`).
 */

import {
  providerChain,
  type ModelRole,
} from "@/lib/ai/config";
import { freeProviderChain } from "@/lib/ai/free";

/** Free AI for one role: configured credentials plus a free-eligible model. */
export function freeAiAvailable(role: ModelRole = "primary") {
  return freeProviderChain(role).length > 0;
}

/**
 * Paid provider accounts are reachable when Revora has a configured provider
 * key and the model router permits that lane. Creative work is authored by the
 * AI team; availability never selects or substitutes a design.
 */
export function paidAiAllowedForBuilder() {
  return providerChain().length > 0;
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
  const voice = builderAiAvailable("transcription");
  const images = builderAiAvailable("image");
  return {
    vision,
    voice,
    images,
    source: freeAiAvailable("vision") ? ("free" as const) : vision ? ("paid" as const) : null,
  };
}
