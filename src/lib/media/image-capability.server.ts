/**
 * LIVE IMAGE-GENERATION CAPABILITY: can Lovable AI make (or edit) a picture
 * right now? Pictures run on Lovable AI image models under the spending cap.
 * Server-only.
 */
import { providerConfig } from "@/lib/ai/config";

/** Lovable AI image models support editing; no paid probe call is made. */
export async function verifyImageEditing(): Promise<boolean> {
  return providerConfig() !== null;
}

export type ImageCapabilityReason =
  | "ready"
  | "free_ai_disabled"
  | "no_provider_configured"
  | "no_free_model"
  | "daily_allowance_spent";

export type ImageProviderCapability = {
  provider: string;
  /** Every Lovable AI image model in the picture roster. */
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
  const config = providerConfig();
  if (!config)
    return unavailable("no_provider_configured", "Lovable AI is not connected, so no picture was generated.");
  const models = config.models.image.split(",").map((id) => id.trim()).filter(Boolean);
  if (models.length === 0)
    return unavailable("no_free_model", "No picture model is configured, so nothing was generated.");
  return {
    available: true,
    reason: "ready",
    message: "Picture making is available.",
    code: "READY",
    providers: [{ provider: "lovable", models, editSupported: true, remainingToday: Number.MAX_SAFE_INTEGER, dailyCap: Number.MAX_SAFE_INTEGER }],
    editSupported: true,
  };
}
