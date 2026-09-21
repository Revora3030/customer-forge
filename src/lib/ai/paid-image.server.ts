/**
 * PAID PREMIUM PICTURE LANE
 * =========================
 *
 * Free picture making always runs first. This lane only exists for the case where
 * the free service is genuinely unavailable AND the operator has explicitly
 * switched paid pictures on, plus for the precision changes the free fabric has
 * never been able to prove it can do. It is deliberately strict:
 *
 *  1. off unless `PAID_IMAGE_ENABLED` is explicitly opted in,
 *  2. off unless the paid lane as a whole is enabled and an OpenAI key exists,
 *  3. the model is chosen by JOB, not by caller: the premium Sunburst tier makes
 *     the hero/editorial frames and every change to an existing picture, the fast
 *     Flare tier makes supporting photos, iterations and variations,
 *  4. every picture is reserved against the SAME durable monthly cap as the paid
 *     text lane (default $20/month, enforced in our own database), settled after
 *     the call and written to the usage ledger,
 *  5. no auto-top-up and no silent overage: once the cap binds, the answer is a
 *     precise blocked reason and the caller keeps its own artwork,
 *  6. availability is PROVEN against the account, never assumed from a model name:
 *     a model the project cannot reach is reported as a blocker, not a fallback.
 *
 * Server-only. The key is read inside functions and never returned to a caller.
 */

import { providerConfig } from "@/lib/ai/config";
import { callPinnedPaidImage } from "@/lib/ai/router.server";
import {
  DEFAULT_IMAGE_TIER_MODELS,
  DEFAULT_IMAGE_TIER_PRICE_USD,
  IMAGE_TIERS,
  IMAGE_TIER_MODEL_ENV,
  IMAGE_TIER_PRICE_ENV,
  describeImageTier,
  planImageWork,
  type ImagePurpose,
  type ImageTier,
} from "@/lib/ai/image-tiers";
import { validateGeneratedImage } from "@/lib/image-studio.server";
import {
  MICROCENTS_PER_DOLLAR,
  formatUsd,
  lunaEnabled,
  lunaMonthlyCapMicrocents,
  recordUsage,
  reserveBudget,
  settleBudget,
} from "@/lib/ai/luna.server";

export type PaidImageBlockReason =
  | "disabled"
  | "no_key"
  | "unsupported_job"
  | "model_unavailable"
  | "budget_exhausted"
  | "ledger_unavailable"
  | "invalid_image"
  | "provider_error";

export type PaidImageResult =
  | {
      ok: true;
      base64: string;
      mimeType: string;
      provider: "openai";
      model: string;
      tier: ImageTier;
      costMicrocents: number;
    }
  | { ok: false; reason: PaidImageBlockReason; message: string };

function env(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optedIn(name: string): boolean {
  const raw = (env(name) ?? "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}

/** The model wired for a tier: environment override first, then the pinned default. */
export function paidImageTierModel(tier: ImageTier): string {
  return (
    env(IMAGE_TIER_MODEL_ENV[tier]) ??
    (tier === "sunburst"
      ? (env("PAID_IMAGE_MODEL") ?? providerConfig("openai")?.models.image ?? null)
      : null) ??
    DEFAULT_IMAGE_TIER_MODELS[tier]
  );
}

/** Conservative per-picture price for a tier, deliberately over-estimated. */
export function paidImagePriceMicrocents(tier: ImageTier = "sunburst"): number {
  const raw = Number(env(IMAGE_TIER_PRICE_ENV[tier]) ?? env("PAID_IMAGE_PRICE_USD") ?? "");
  const dollars = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_IMAGE_TIER_PRICE_USD[tier];
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** True only when a paid picture may genuinely be attempted right now. */
export function paidImageAllowed(): boolean {
  return optedIn("PAID_IMAGE_ENABLED") && lunaEnabled();
}

/** Plain-language status for the builder, safe to show a business owner. */
export function paidImageStatus(): { allowed: boolean; message: string } {
  if (!optedIn("PAID_IMAGE_ENABLED"))
    return {
      allowed: false,
      message: "Paid premium pictures are switched off, so only the free picture service is used.",
    };
  if (!lunaEnabled())
    return {
      allowed: false,
      message:
        "Paid picture making is not available in this workspace right now, so only the free picture service is used.",
    };
  return {
    allowed: true,
    message: `Premium pictures can be used as a backup, inside the monthly spending cap of ${formatUsd(
      lunaMonthlyCapMicrocents(),
    )}.`,
  };
}

/** Back-compatible default model accessor (the premium tier). */
export function paidImageModel(): string {
  return paidImageTierModel("sunburst");
}

/* ------------------------- live account capability ------------------------- */

type TierProbe = { available: boolean; detail: string; at: number };
const PROBE_TTL_MS = 30 * 60 * 1000;
const probes = new Map<string, TierProbe>();

/** Forgets cached capability answers (used by tests and after a key change). */
export function resetPaidImageCapability() {
  probes.clear();
}

/**
 * Asks the account whether it can actually reach a model, without generating a
 * picture (so it costs nothing). A model that exists in our routing table but is
 * not enabled on the project is reported as unavailable — never silently swapped.
 */
async function probeTier(tier: ImageTier, apiKey: string): Promise<TierProbe> {
  const model = paidImageTierModel(tier);
  const cached = probes.get(model);
  const now = Date.now();
  if (cached && now - cached.at < PROBE_TTL_MS) return cached;
  let probe: TierProbe;
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    probe = response.ok
      ? { available: true, detail: "available on this account", at: now }
      : {
          available: false,
          detail:
            response.status === 403 || response.status === 404
              ? "this account does not have access to the model yet"
              : `the picture service answered ${response.status}`,
          at: now,
        };
  } catch {
    probe = { available: false, detail: "the picture service could not be reached", at: now };
  }
  probes.set(model, probe);
  return probe;
}

export type PaidImageTierCapability = {
  tier: ImageTier;
  model: string;
  purpose: string;
  editing: boolean;
  available: boolean;
  detail: string;
  pricePerImage: string;
};

export type PaidImageCapability = {
  /** True only when at least one premium picture model can actually be reached. */
  available: boolean;
  /** Plain-language sentence, safe to show a business owner. No secrets. */
  message: string;
  tiers: PaidImageTierCapability[];
};

/**
 * The honest answer to "can Revora make a premium picture right now?".
 * Nothing here trusts the existence of code or a model name.
 */
export async function paidImageCapability(): Promise<PaidImageCapability> {
  const status = paidImageStatus();
  const listed = (available: boolean, detail: string): PaidImageTierCapability[] =>
    IMAGE_TIERS.map((tier) => ({
      tier,
      model: paidImageTierModel(tier),
      purpose: describeImageTier(tier),
      editing: tier === "sunburst",
      available,
      detail,
      pricePerImage: formatUsd(paidImagePriceMicrocents(tier)),
    }));

  if (!status.allowed)
    return { available: false, message: status.message, tiers: listed(false, "switched off") };

  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey)
    return {
      available: false,
      message: "Premium picture making is not connected, so Revora uses the free service only.",
      tiers: listed(false, "no credential configured"),
    };

  const tiers: PaidImageTierCapability[] = [];
  for (const tier of IMAGE_TIERS) {
    const probe = await probeTier(tier, apiKey);
    tiers.push({
      tier,
      model: paidImageTierModel(tier),
      purpose: describeImageTier(tier),
      editing: tier === "sunburst",
      available: probe.available,
      detail: probe.detail,
      pricePerImage: formatUsd(paidImagePriceMicrocents(tier)),
    });
  }
  const available = tiers.some((entry) => entry.available);
  return {
    available,
    message: available
      ? `Premium pictures are available inside the monthly spending cap of ${formatUsd(lunaMonthlyCapMicrocents())}.`
      : "The premium picture models are not enabled on the connected account yet, so Revora uses the free service and its own artwork.",
    tiers,
  };
}

/* ------------------------------ the real call ------------------------------ */

export type PaidImageJob = {
  prompt: string;
  purpose: ImagePurpose;
  /** Required for a change to an existing picture; ignored for a fresh frame. */
  source?: { dataUrl: string; mimeType: string } | null;
};

/**
 * Makes or changes ONE premium picture, fully accounted against the durable cap.
 * Never throws: every failure comes back as a precise blocked reason.
 */
export async function generatePaidImage(
  job: PaidImageJob,
  caller: { organizationId: string | null; userId?: string | null },
): Promise<PaidImageResult> {
  if (!paidImageAllowed())
    return { ok: false, reason: "disabled", message: paidImageStatus().message };

  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey)
    return {
      ok: false,
      reason: "no_key",
      message: "Premium picture making is not connected, so Revora used its own artwork instead.",
    };

  const plan = planImageWork(job.purpose);
  if (!plan.supported)
    return {
      ok: false,
      reason: "unsupported_job",
      message: "That picture change is not something the premium picture models can do here.",
    };
  const source = plan.editing ? (job.source ?? null) : null;
  if (plan.editing && !source)
    return {
      ok: false,
      reason: "unsupported_job",
      message: "No original picture was supplied, so there was nothing to change.",
    };

  const probe = await probeTier(plan.tier, apiKey);
  if (!probe.available)
    return {
      ok: false,
      reason: "model_unavailable",
      message: `The premium picture model is not available yet (${probe.detail}), so Revora used its own artwork instead. Nothing was charged.`,
    };

  const model = paidImageTierModel(plan.tier);
  const estimate = paidImagePriceMicrocents(plan.tier);
  const reservation = await reserveBudget(estimate, caller.organizationId);
  if (!reservation)
    return {
      ok: false,
      reason: "ledger_unavailable",
      message:
        "Revora could not confirm the picture spending cap, so no paid picture was made and its own artwork was used.",
    };
  if (!reservation.allowed) {
    await recordUsage({
      organizationId: caller.organizationId,
      purpose: "image_generation",
      model,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "skipped",
      reason: "budget_exhausted",
    });
    return {
      ok: false,
      reason: "budget_exhausted",
      message: `This month's ${formatUsd(reservation.cap)} picture and AI allowance is used up, so Revora used its own artwork instead. Nothing extra was charged.`,
    };
  }

  try {
    // Every model call goes through the router, including this pinned one.
    const result = await callPinnedPaidImage(
      {
        task: plan.editing ? "image_edit" : "image_generation",
        organizationId: caller.organizationId,
        userId: caller.userId ?? null,
      },
      job.prompt,
      model,
      source,
    );
    const check = validateGeneratedImage({ base64: result.base64, mimeType: result.mimeType });
    if (!check.ok) {
      // The call happened, so it is settled and recorded honestly, but the asset
      // is dropped rather than attached to a customer's website.
      await settleBudget(caller.organizationId, estimate, estimate);
      await recordUsage({
        organizationId: caller.organizationId,
        purpose: "image_generation",
        model,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        cost: estimate,
        outcome: "failed",
        reason: "invalid_image",
      });
      return { ok: false, reason: "invalid_image", message: check.message };
    }
    await settleBudget(caller.organizationId, estimate, estimate);
    await recordUsage({
      organizationId: caller.organizationId,
      purpose: "image_generation",
      model,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: estimate,
      outcome: "succeeded",
      reason: null,
    });
    return {
      ok: true,
      base64: result.base64,
      mimeType: result.mimeType,
      provider: "openai",
      model,
      tier: plan.tier,
      costMicrocents: estimate,
    };
  } catch (error) {
    await settleBudget(caller.organizationId, estimate, 0);
    await recordUsage({
      organizationId: caller.organizationId,
      purpose: "image_generation",
      model,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "failed",
      reason: error instanceof Error ? error.message.slice(0, 200) : "provider_error",
    });
    return {
      ok: false,
      reason: "provider_error",
      message:
        "The premium picture service did not return a picture, so Revora used its own artwork instead. Nothing was charged for it.",
    };
  }
}

/** Back-compatible entry point for a fresh supporting picture. */
export async function generatePaidImageBase64(
  prompt: string,
  caller: { organizationId: string | null; userId?: string | null },
  purpose: ImagePurpose = "starter_photo",
): Promise<PaidImageResult> {
  return generatePaidImage({ prompt, purpose }, caller);
}

/** Precision change to an existing picture — premium tier only. */
export async function editPaidImage(
  prompt: string,
  source: { dataUrl: string; mimeType: string },
  caller: { organizationId: string | null; userId?: string | null },
): Promise<PaidImageResult> {
  return generatePaidImage({ prompt, purpose: "precision_edit", source }, caller);
}
