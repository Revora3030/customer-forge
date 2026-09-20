/**
 * Server side of the Revora AI Image Studio.
 *
 * Asks Revora's own AI layer for one image from a production brief built by
 * `visual-direction.ts`, then stores the result in the tenant's own private
 * media folder. A refusal or an unconfigured provider is returned as a plain
 * message rather than thrown, so the builder never dead-ends on a red error.
 */

import { RevoraAiError } from "@/lib/ai/errors";
import { generateImage } from "@/lib/ai/router.server";

export type GeneratedImage =
  { ok: true; base64: string } | { ok: false; blocked: boolean; message: string };

/** Generates one image. `blocked: true` means AI imagery is unavailable right now. */
export async function generateImageBase64(
  prompt: string,
  caller?: { organizationId?: string | null; userId?: string | null },
): Promise<GeneratedImage> {
  try {
    const result = await generateImage(
      {
        task: "image.generate",
        organizationId: caller?.organizationId ?? null,
        userId: caller?.userId ?? null,
      },
      prompt,
    );
    return { ok: true, base64: result.base64 };
  } catch (error) {
    if (error instanceof RevoraAiError) {
      const blocked = ["not_configured", "free_unavailable", "unauthorized", "quota", "policy"].includes(
        error.category,
      );
      return { ok: false, blocked, message: error.message };
    }
    return {
      ok: false,
      blocked: false,
      message: "The image service didn't respond. Try again in a moment.",
    };
  }
}

/** Decodes a base64 PNG into bytes for storage upload. */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
