/**
 * What AI the builder can actually reach right now: Lovable AI, when its key
 * is configured. Server-only (reads `process.env`).
 */
import { providerChain, type ModelRole } from "@/lib/ai/config";

/** Lovable AI is reachable when its key is configured. */
export function paidAiAllowedForBuilder() {
  return providerChain().length > 0;
}

/** Can the builder call a model for this role at all? */
export function builderAiAvailable(role: ModelRole = "primary") {
  return providerChain().some((config) => config.models[role].trim().length > 0);
}

/** Honest media capability for the builder UI. */
export function builderMediaAvailability() {
  const vision = builderAiAvailable("vision");
  const voice = builderAiAvailable("transcription");
  const images = builderAiAvailable("image");
  return { vision, voice, images, source: vision ? ("lovable" as const) : null };
}
