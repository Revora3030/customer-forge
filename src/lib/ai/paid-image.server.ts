/**
 * PAID STARTER-PICTURE FALLBACK LANE
 * ==================================
 *
 * Free picture making always runs first. This lane only exists for the case where
 * the free service is genuinely unavailable AND the operator has explicitly
 * switched paid pictures on. It is deliberately strict:
 *
 *  1. off unless `PAID_IMAGE_ENABLED` is explicitly opted in,
 *  2. off unless the paid lane as a whole is enabled and an OpenAI key exists,
 *  3. every picture is reserved against the SAME durable monthly cap as the paid
 *     text lane (default $20/month, enforced in our own database), settled after
 *     the call and written to the usage ledger,
 *  4. no auto-top-up and no silent overage: once the cap binds, the answer is a
 *     precise blocked reason and the caller keeps its own artwork.
 *
 * Server-only. The key is read inside functions and never returned to a caller.
 */

import { providerConfig } from "@/lib/ai/config";
import { callPinnedPaidImage } from "@/lib/ai/router.server";
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
  | "budget_exhausted"
  | "ledger_unavailable"
  | "provider_error";

export type PaidImageResult =
  | {
      ok: true;
      base64: string;
      mimeType: string;
      provider: "openai";
      model: string;
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

/** Conservative per-picture price, deliberately over-estimated. */
export function paidImagePriceMicrocents(): number {
  const raw = Number(env("PAID_IMAGE_PRICE_USD") ?? "");
  const dollars = Number.isFinite(raw) && raw >= 0 ? raw : 0.12;
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** True only when a paid starter picture may genuinely be attempted right now. */
export function paidImageAllowed(): boolean {
  return optedIn("PAID_IMAGE_ENABLED") && lunaEnabled();
}

/** Plain-language status for the builder, safe to show a business owner. */
export function paidImageStatus(): { allowed: boolean; message: string } {
  if (!optedIn("PAID_IMAGE_ENABLED"))
    return {
      allowed: false,
      message: "Paid starter pictures are switched off, so only the free picture service is used.",
    };
  if (!lunaEnabled())
    return {
      allowed: false,
      message:
        "Paid picture making is not available in this workspace right now, so only the free picture service is used.",
    };
  return {
    allowed: true,
    message: `Paid starter pictures can be used as a backup, inside the monthly spending cap of ${formatUsd(
      lunaMonthlyCapMicrocents(),
    )}.`,
  };
}

export function paidImageModel(): string {
  return env("PAID_IMAGE_MODEL") ?? providerConfig("openai")?.models.image ?? "gpt-image-2";
}

/**
 * Makes ONE paid starter picture, fully accounted against the durable cap.
 * Never throws: every failure comes back as a precise blocked reason.
 */
export async function generatePaidImageBase64(
  prompt: string,
  caller: { organizationId: string | null; userId?: string | null },
): Promise<PaidImageResult> {
  if (!paidImageAllowed())
    return {
      ok: false,
      reason: "disabled",
      message: paidImageStatus().message,
    };

  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey)
    return {
      ok: false,
      reason: "no_key",
      message: "Paid picture making is not connected, so Revora used its own artwork instead.",
    };

  const estimate = paidImagePriceMicrocents();
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
      model: paidImageModel(),
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

  const model = paidImageModel();
  try {
    // Every model call goes through the router, including this pinned one.
    const result = await callPinnedPaidImage(
      { task: "image_generation", organizationId: caller.organizationId, userId: caller.userId ?? null },
      prompt,
      model,
    );
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
        "The paid picture service did not return a picture, so Revora used its own artwork instead. Nothing was charged for it.",
    };
  }
}
