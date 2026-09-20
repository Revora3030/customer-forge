/**
 * LIVE IMAGE-GENERATION CAPABILITY
 * ================================
 *
 * One honest, live answer to "can Revora make a picture right now, for free?".
 *
 * Nothing here trusts the existence of code. A provider is only reported as
 * usable when ALL of these are true at the moment of asking:
 *
 *  1. free AI is enabled and free-only mode has not been switched off,
 *  2. the provider's credentials are actually present in this environment,
 *  3. it has at least one model that passes the free-eligibility gate for the
 *     image role (paid or partner-billed models can never qualify),
 *  4. today's conservative free picture allowance is not spent.
 *
 * Model availability is live-discovered from the provider's own catalogue
 * (including its published pricing), so a model Cloudflare moves behind its paid
 * plan stops being selected without any code change here.
 *
 * Server-only: reads `process.env` and calls provider catalogue endpoints.
 */

import type { ModelRole } from "@/lib/ai/config";
import {
  freeAiEnabled,
  freeImageBudgetCap,
  freeImageBudgetRemaining,
  freeProviderChain,
  imageEditCapableModel,
  isFreeEligibleModel,
  type FreeProviderName,
} from "@/lib/ai/free";
import { discoveredFreeModels, refreshFreeModels } from "@/lib/ai/free-models.server";

const IMAGE_ROLE: ModelRole = "image";

export type ImageCapabilityReason =
  | "ready"
  | "free_ai_disabled"
  | "no_provider_configured"
  | "no_free_model"
  | "daily_allowance_spent";

export type ImageProviderCapability = {
  provider: FreeProviderName;
  /** Every free-eligible image model this provider is currently serving. */
  models: string[];
  /** Can any selected model change an existing picture (not just make one)? */
  editSupported: boolean;
  /** Pictures left in today's conservative free allowance. */
  remainingToday: number;
  dailyCap: number;
};

export type ImageCapability = {
  /** True only when a genuinely free provider can make a picture right now. */
  available: boolean;
  reason: ImageCapabilityReason;
  /** Plain-language sentence, safe to show a business owner. No secrets. */
  message: string;
  /** Machine-readable code for callers that must not fabricate success. */
  code: "READY" | "IMAGE_GENERATION_UNAVAILABLE";
  providers: ImageProviderCapability[];
  editSupported: boolean;
};

function unavailable(reason: ImageCapabilityReason, message: string): ImageCapability {
  return {
    available: false,
    reason,
    message,
    code: "IMAGE_GENERATION_UNAVAILABLE",
    providers: [],
    editSupported: false,
  };
}

/**
 * Builds the live capability report. Discovery failures are never fatal: the
 * verified configured model still counts, and a provider with nothing verified
 * is simply left out rather than assumed to work.
 */
export async function imageGenerationCapability(): Promise<ImageCapability> {
  if (!freeAiEnabled())
    return unavailable(
      "free_ai_disabled",
      "Picture making is switched off for this workspace, so nothing was generated.",
    );

  const chain = freeProviderChain(IMAGE_ROLE);
  if (chain.length === 0)
    return unavailable(
      "no_provider_configured",
      "No free picture service is connected yet, so Revora used its own artwork instead of generating a photo.",
    );

  const providers: ImageProviderCapability[] = [];
  let spentEverywhere = true;

  for (const entry of chain) {
    try {
      await refreshFreeModels(entry.name, entry.credentials, IMAGE_ROLE);
    } catch {
      // Catalogue lookups are advisory. The verified configured model stands.
    }
    const models: string[] = [];
    for (const model of [...discoveredFreeModels(entry.name, IMAGE_ROLE), entry.model])
      if (!models.includes(model) && isFreeEligibleModel(entry.name, model)) models.push(model);
    if (models.length === 0) continue;

    const remainingToday = freeImageBudgetRemaining(entry.name);
    if (remainingToday > 0) spentEverywhere = false;
    providers.push({
      provider: entry.name,
      models,
      editSupported: models.some((model) => imageEditCapableModel(model)),
      remainingToday,
      dailyCap: freeImageBudgetCap(entry.name),
    });
  }

  if (providers.length === 0)
    return unavailable(
      "no_free_model",
      "The connected picture service is not currently serving a model Revora has verified as free, so nothing was generated.",
    );

  if (spentEverywhere)
    return unavailable(
      "daily_allowance_spent",
      "Today's free picture allowance is used up. Picture making comes back tomorrow — nothing was charged.",
    );

  const usable = providers.filter((entry) => entry.remainingToday > 0);
  return {
    available: true,
    reason: "ready",
    message: "Free picture making is available.",
    code: "READY",
    providers,
    editSupported: usable.some((entry) => entry.editSupported),
  };
}
