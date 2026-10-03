/**
 * Cloudflare Workers AI picture request bodies.
 *
 * Kept separate from the adapter so the exact request Revora sends can be tested
 * without any network call.
 *
 * MAKING a picture is a plain `{ prompt }` body.
 *
 * CHANGING an existing picture needs an image-to-image / inpainting model, and
 * Workers AI requires BOTH the source image and a mask as byte arrays. Revora
 * sends a full-coverage (all-white) mask, which means "you may restyle the whole
 * picture", and a strength below 1 so the result stays recognisably the same
 * subject rather than an unrelated new picture. The mask is a tiny 512x512
 * greyscale PNG embedded below: Workers AI resizes it to the source, so one
 * constant covers every picture size and no image library is needed in the
 * Worker runtime.
 */

import { bytesFromDataUrl } from "@/lib/ai/providers/shared";

/** 512x512 all-white greyscale PNG — "change anything in this picture". */
export const FULL_COVERAGE_MASK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAAAAADRE4smAAAE3ElEQVR4nO3SMQEAIAzAMMC/5yFjRxMFPXrnUPa2A9hlgDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQNwHs1sE/8fDO7AAAAAASUVORK5CYII=";

/**
 * How strongly an edit may depart from the source picture. Low enough that the
 * owner's subject survives, high enough that the requested change is visible.
 */
export const EDIT_STRENGTH = 0.65;
export const EDIT_STEPS = 20;

function byteArray(base64: string): number[] {
  return Array.from(bytesFromDataUrl(base64));
}

/**
 * Quality settings for MAKING a picture, per model, using only the fields each
 * model's published input schema accepts (unknown fields are rejected):
 * - FLUX.1 schnell takes `prompt` and `steps` (default 4, maximum 8). Eight
 *   steps gives noticeably sharper detail and cleaner hands/edges.
 * - Stable Diffusion models take a `negative_prompt`, used to keep text,
 *   watermarks, logos and blur out of website photography.
 */
export const FLUX_SCHNELL_STEPS = 8;
export const PHOTO_NEGATIVE_PROMPT =
  "text, words, letters, watermark, signature, logo, caption, blurry, out of focus, low resolution, jpeg artifacts, oversaturated, cartoon, illustration, 3d render, deformed hands, extra fingers, distorted faces, cropped subject, frame, border";

export type CloudflareImageBody =
  | { prompt: string }
  | { prompt: string; steps: number }
  | { prompt: string; negative_prompt: string }
  | {
      prompt: string;
      image: number[];
      mask: number[];
      strength: number;
      num_steps: number;
    };

/**
 * Builds the Workers AI body. With a source picture this is an edit request; the
 * caller is responsible for only ever selecting an edit-capable model.
 */
export function buildCloudflareImageBody(
  prompt: string,
  source?: { dataUrl: string; mimeType: string } | null,
  model?: string,
): CloudflareImageBody {
  if (!source) {
    // Flux caps the prompt at 2048 characters and refuses anything longer.
    if (model && /flux-1-schnell/i.test(model)) return { prompt: prompt.slice(0, 2048), steps: FLUX_SCHNELL_STEPS };
    if (model && /stable-diffusion/i.test(model)) return { prompt, negative_prompt: PHOTO_NEGATIVE_PROMPT };
    return { prompt };
  }
  return {
    prompt,
    image: byteArray(source.dataUrl),
    mask: byteArray(FULL_COVERAGE_MASK_PNG_BASE64),
    strength: EDIT_STRENGTH,
    num_steps: EDIT_STEPS,
  };
}
