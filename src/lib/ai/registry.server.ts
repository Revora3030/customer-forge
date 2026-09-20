/**
 * The authoritative free-model registry.
 *
 * One catalogue of every model Revora can actually reach for free, built from
 * live provider discovery plus the verified configured defaults. Nothing here
 * decides that a model is free because its name says "free", "flash" or
 * ":free": eligibility is always `isFreeEligibleModel` (provider pricing /
 * catalogue evidence), and each entry records where its evidence came from and
 * when it was last confirmed.
 *
 * The registry is descriptive. It never calls a model — the router does that —
 * so it is safe to build for the admin surface as well as for the ensemble.
 *
 * Server-only.
 */

import type { ModelRole } from "@/lib/ai/config";
import {
  durableBudgetRemaining,
  durableProviderResting,
  durableRuntimeFor,
} from "@/lib/ai/durable-health.server";
import {
  FREE_ALLOWANCE,
  freeBudgetCap,
  freeBudgetRemaining,
  isFreeEligibleModel,
  type FreeProviderName,
} from "@/lib/ai/free";
import { freeModelPool, providerHealth } from "@/lib/ai/router.server";

/** What a model is good for, as far as its provider catalogue evidences. */
export type ModelCapability =
  | "planning"
  | "reasoning"
  | "coding"
  | "frontend"
  | "design"
  | "copy"
  | "seo"
  | "cro"
  | "accessibility"
  | "qa"
  | "critique"
  | "facts"
  | "security"
  | "vision"
  | "image"
  | "transcription";

export type ModelModality = "text" | "vision" | "image" | "transcription";

export type RegistryModel = {
  provider: FreeProviderName;
  model: string;
  displayName: string;
  modality: ModelModality;
  capabilities: ModelCapability[];
  role: ModelRole;
  /** Always true in this registry — a non-free model never enters it. */
  free: true;
  /** Where the free verdict came from. */
  freeEvidence: "provider_catalogue" | "verified_default";
  /** Confidence in that verdict: live catalogue beats a verified default. */
  confidence: "live" | "configured";
  verifiedAt: number;
  /** Rough capability weight used for lane ordering; from the id, not hype. */
  weight: number;
  structuredOutput: boolean;
  streaming: boolean;
  contextWindow: number | null;
  health: { healthy: boolean; failures: number; cooldownUntil: number | null };
  quota: { allowance: string; remainingToday: number | null };
};

/** Size class read off the model id, used as the capability weight. */
function sizeWeight(model: string): number {
  const billions = /(\d{2,4})\s*b\b/i.exec(model.replace(/[-_]/g, " "));
  if (billions) {
    const value = Number(billions[1]);
    if (Number.isFinite(value)) return Math.min(100, 30 + value / 6);
  }
  if (/120b|235b|480b|405b/i.test(model)) return 95;
  if (/70b|72b|large|nemotron|maverick/i.test(model)) return 80;
  if (/32b|30b|27b/i.test(model)) return 66;
  if (/flash|lite|mini|small|8b|4b|3b|nano|schnell/i.test(model)) return 40;
  return 50;
}

/**
 * Capabilities inferred from the provider catalogue id and the role pool the id
 * was discovered in. Deterministic and side-effect free, so it is unit tested.
 */
export function inferCapabilities(model: string, role: ModelRole): ModelCapability[] {
  const caps = new Set<ModelCapability>();
  if (role === "image") {
    caps.add("image");
    return [...caps];
  }
  if (role === "transcription") {
    caps.add("transcription");
    return [...caps];
  }
  if (role === "vision" || /vision|-vl|vl-|multimodal|gemma|scout|maverick/i.test(model)) {
    caps.add("vision");
    caps.add("critique");
  }
  if (/cod(?:e|er)|codestral|qwen|glm|devstral/i.test(model)) {
    caps.add("coding");
    caps.add("frontend");
  }
  const weight = sizeWeight(model);
  if (weight >= 60) {
    caps.add("planning");
    caps.add("reasoning");
    caps.add("design");
    caps.add("critique");
    caps.add("security");
  }
  // Every reachable chat model can do the short, well-bounded language work.
  caps.add("copy");
  caps.add("seo");
  caps.add("cro");
  caps.add("accessibility");
  caps.add("qa");
  caps.add("facts");
  return [...caps];
}

function modalityFor(role: ModelRole, capabilities: ModelCapability[]): ModelModality {
  if (role === "image") return "image";
  if (role === "transcription") return "transcription";
  return capabilities.includes("vision") ? "vision" : "text";
}

function displayName(provider: FreeProviderName, model: string) {
  const short = model.replace(/^@cf\//, "").replace(/:free$/i, "");
  return `${FREE_ALLOWANCE[provider].label} · ${short}`;
}

let snapshot: { at: number; role: ModelRole; models: RegistryModel[] } | null = null;

/** The last registry Revora built, for the admin surface. No secrets. */
export function registrySnapshot() {
  return snapshot;
}

export function resetRegistrySnapshot() {
  snapshot = null;
}

/**
 * Builds the registry for one role from the live pool. Every entry has already
 * passed the free-eligibility gate inside `freeModelPool`; it is re-checked here
 * so a future caller cannot inject an id.
 */
export async function buildFreeModelRegistry(role: ModelRole): Promise<RegistryModel[]> {
  const pools = await freeModelPool(role);
  const health = new Map(providerHealth().map((entry) => [entry.provider, entry]));
  const at = Date.now();
  const models: RegistryModel[] = [];
  for (const pool of pools)
    for (const [index, model] of pool.models.entries()) {
      if (!isFreeEligibleModel(pool.provider, model)) continue;
      const capabilities = inferCapabilities(model, role);
      const state = health.get(pool.provider);
      // The shared (cross-worker) record is the fuller truth about usage and
      // resting periods: this worker may not have made the calls that spent the
      // allowance. Whichever picture is more cautious is the one shown.
      const shared = durableRuntimeFor(pool.provider);
      const sharedRemaining = durableBudgetRemaining(pool.provider, freeBudgetCap(pool.provider));
      const localRemaining = freeBudgetRemaining(pool.provider);
      models.push({
        provider: pool.provider,
        model,
        displayName: displayName(pool.provider, model),
        modality: modalityFor(role, capabilities),
        capabilities,
        role,
        free: true,
        // The first id of a pool is the verified configured default when
        // discovery returned nothing; otherwise the pool came from the
        // provider's own catalogue.
        freeEvidence: pool.models.length > 1 || index > 0 ? "provider_catalogue" : "verified_default",
        confidence: pool.models.length > 1 ? "live" : "configured",
        verifiedAt: at,
        weight: sizeWeight(model),
        structuredOutput: true,
        streaming: role !== "image" && role !== "transcription",
        contextWindow: null,
        health: {
          healthy: (state?.healthy ?? true) && !durableProviderResting(pool.provider),
          failures: Math.max(state?.failures ?? 0, shared?.failures ?? 0),
          cooldownUntil: Math.max(state?.cooldownUntil ?? 0, shared?.openUntil ?? 0) || null,
        },
        quota: {
          allowance: FREE_ALLOWANCE[pool.provider].allowance,
          remainingToday:
            localRemaining === null
              ? sharedRemaining
              : sharedRemaining === null
                ? localRemaining
                : Math.min(localRemaining, sharedRemaining),
        },
      });
    }
  models.sort((a, b) => b.weight - a.weight);
  snapshot = { at, role, models };
  return models;
}

/** Registry entries that can serve a capability, strongest first. */
export function modelsForCapability(
  models: RegistryModel[],
  capability: ModelCapability,
): RegistryModel[] {
  return models.filter((entry) => entry.capabilities.includes(capability));
}
