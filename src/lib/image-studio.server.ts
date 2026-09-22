/**
 * Server side of the Revora AI Image Studio.
 *
 * Asks Revora's own AI layer for one image from a production brief built by
 * `visual-direction.ts`, then the caller stores the result in the tenant's own
 * private media folder.
 *
 * Honesty rules baked in:
 * - A live capability check runs FIRST. If no genuinely free picture provider is
 *   ready, the answer is a structured `IMAGE_GENERATION_UNAVAILABLE` with the
 *   exact reason. Nothing is ever reported as generated when it was not.
 * - Identical briefs for the same workspace are de-duplicated for a short
 *   window, so a double click or a repeated plan step cannot spend the free
 *   daily allowance twice on the same picture.
 */

import { RevoraAiError } from "@/lib/ai/errors";
import { editImage, generateImage } from "@/lib/ai/router.server";
import {
  imageGenerationCapability,
  type ImageCapability,
  type ImageCapabilityReason,
  verifyImageEditing,
} from "@/lib/media/image-capability.server";

export type GeneratedImage =
  | {
      ok: true;
      base64: string;
      mimeType: string;
      provider: string;
      model: string;
      /** How the picture came about. Never claims generation for a fallback. */
      source: "generated";
      /** True when an identical brief was served from the short-lived cache. */
      cached: boolean;
    }
  | {
      ok: false;
      blocked: boolean;
      message: string;
      code: "IMAGE_GENERATION_UNAVAILABLE" | "IMAGE_GENERATION_FAILED";
      reason: ImageCapabilityReason | "provider_error";
    };

/* ------------------------------ brief de-dup ------------------------------- */

type CacheEntry = { at: number; base64: string; mimeType: string; provider: string; model: string };

const DEDUP_TTL_MS = 10 * 60 * 1000;
const DEDUP_MAX = 40;
/** Keyed by workspace + brief, so one tenant can never read another's picture. */
const dedup = new Map<string, CacheEntry>();

function dedupKey(organizationId: string | null | undefined, prompt: string, edit: boolean) {
  return `${organizationId ?? "platform"}::${edit ? "edit" : "new"}::${prompt.trim().toLowerCase()}`;
}

export function resetImageDedupCache() {
  dedup.clear();
}

function readDedup(key: string) {
  const entry = dedup.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > DEDUP_TTL_MS) {
    dedup.delete(key);
    return null;
  }
  return entry;
}

function writeDedup(key: string, entry: Omit<CacheEntry, "at">) {
  if (dedup.size >= DEDUP_MAX) {
    const oldest = [...dedup.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) dedup.delete(oldest[0]);
  }
  dedup.set(key, { ...entry, at: Date.now() });
}

/* ------------------------------- validation -------------------------------- */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1024;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

/** Rejects a broken, empty, oversized or non-image provider answer. */
export function validateGeneratedImage(input: {
  base64: string;
  mimeType: string;
}): { ok: true; bytes: number } | { ok: false; problem: string } {
  const mime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_MIME.includes(mime))
    return { ok: false, problem: `the picture came back in an unsupported format (${mime || "unknown"})` };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(input.base64))
    return { ok: false, problem: "the picture data came back damaged" };
  const bytes = Math.floor((input.base64.replace(/\s+/g, "").length * 3) / 4);
  if (bytes < MIN_IMAGE_BYTES) return { ok: false, problem: "the picture came back empty" };
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, problem: "the picture came back too large to store" };
  return { ok: true, bytes };
}

/* -------------------------------- generation ------------------------------- */

function unavailable(capability: ImageCapability): GeneratedImage {
  return {
    ok: false,
    blocked: true,
    message: capability.message,
    code: "IMAGE_GENERATION_UNAVAILABLE",
    reason: capability.reason,
  };
}

/**
 * Generates (or edits) one picture. `blocked: true` means free picture making is
 * genuinely unavailable right now and the caller must preserve the existing
 * image or block a required media slot — never claim a picture was made.
 */
export async function generateImageBase64(
  prompt: string,
  caller?: { organizationId?: string | null; userId?: string | null },
  options?: { source?: { dataUrl: string; mimeType: string } },
): Promise<GeneratedImage> {
  const capability = await imageGenerationCapability();
  if (!capability.available) return unavailable(capability);

  const edit = Boolean(options?.source);
  // Proof, not assumption: an edit is only attempted once a real sample change
  // has succeeded recently on the free service.
  const canEdit = edit ? capability.editSupported && (await verifyImageEditing()) : false;
  if (edit && !canEdit)
    return {
      ok: false,
      blocked: true,
      message:
        "The free picture service can make new pictures, but changing an existing picture isn't working right now, so nothing was altered.",
      code: "IMAGE_GENERATION_UNAVAILABLE",
      reason: "no_free_model",
    };

  const key = dedupKey(caller?.organizationId, prompt, edit);
  if (!edit) {
    const cached = readDedup(key);
    if (cached)
      return {
        ok: true,
        base64: cached.base64,
        mimeType: cached.mimeType,
        provider: cached.provider,
        model: cached.model,
        source: "generated",
        cached: true,
      };
  }

  try {
    const request = {
      task: edit ? ("image.edit" as const) : ("image.generate" as const),
      organizationId: caller?.organizationId ?? null,
      userId: caller?.userId ?? null,
    };
    const result = options?.source
      ? await editImage(request, prompt, options.source)
      : await generateImage(request, prompt);

    const check = validateGeneratedImage({ base64: result.base64, mimeType: result.mimeType });
    if (!check.ok)
      return {
        ok: false,
        blocked: false,
        message: `Revora didn't keep that picture because ${check.problem}. Nothing was saved.`,
        code: "IMAGE_GENERATION_FAILED",
        reason: "provider_error",
      };

    if (!edit)
      writeDedup(key, {
        base64: result.base64,
        mimeType: result.mimeType,
        provider: result.provider,
        model: result.model,
      });

    return {
      ok: true,
      base64: result.base64,
      mimeType: result.mimeType,
      provider: result.provider,
      model: result.model,
      source: "generated",
      cached: false,
    };
  } catch (error) {
    if (error instanceof RevoraAiError) {
      const blocked = [
        "not_configured",
        "free_unavailable",
        "unauthorized",
        "quota",
        "policy",
        "rate_limited",
      ].includes(error.category);
      return {
        ok: false,
        blocked,
        message: error.message,
        code: "IMAGE_GENERATION_FAILED",
        reason: "provider_error",
      };
    }
    return {
      ok: false,
      blocked: false,
      message: "The picture service didn't respond. Try again in a moment.",
      code: "IMAGE_GENERATION_FAILED",
      reason: "provider_error",
    };
  }
}

/**
 * Decodes a base64 image into bytes for storage upload.
 *
 * Works in every runtime this code reaches: the Worker/browser `atob` when it is
 * present, and Node's `Buffer` when it is not (unit tests, scripts, server
 * builds without the web globals).
 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "");
  const globalAtob = (globalThis as { atob?: (value: string) => string }).atob;
  if (typeof globalAtob === "function") {
    const binary = globalAtob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const nodeBuffer = (
    globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }
  ).Buffer;
  if (nodeBuffer) {
    const buffer = nodeBuffer.from(clean, "base64");
    return new Uint8Array(buffer);
  }
  throw new Error("No base64 decoder is available in this runtime.");
}

/** Encodes raw picture bytes back into base64 for a provider edit request. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}
