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
  "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAAAAADRE4smAAAE3ElEQVR4nO3SMQEAIAzAMMC/5yFjRxMFPXrnUPa2A9hl" +
  "gDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBn".repeat(20) +
  "gDgDxBkgzgBxBogzQNwHs1sE/8fDO7AAAAAASUVORK5CYII=";

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
/** SDXL base: maximum published step count and a firm prompt guidance. */
export const SDXL_BASE_STEPS = 20;
export const SDXL_GUIDANCE = 7.5;
export const PHOTO_NEGATIVE_PROMPT =
  "text, words, letters, numbers, watermark, signature, logo, emblem, badge, car badge, licence plate, stamp, seal, caption, collage, split screen, grid, multiple panels, blurry, out of focus, low resolution, jpeg artifacts, washed out, dull grey, oversaturated, cartoon, illustration, 3d render, plastic, deformed hands, extra fingers, distorted faces, cropped subject, frame, border";

/**
 * FLUX.2 [klein] 4B settings. The model is fixed at 4 steps (it is distilled,
 * so `steps` is not accepted). `guidance` raises prompt adherence so the
 * negative instructions in the brief ("no text, no logos") are actually obeyed.
 */
export const FLUX2_KLEIN_GUIDANCE = 4.5;

/** Output size for a requested aspect ratio, inside klein's 256–1920 range. */
export function flux2Size(prompt: string): { width: number; height: number } {
  const ratio = /aspect ratio:?\s*(\d{1,2})\s*[:x/]\s*(\d{1,2})/i.exec(prompt);
  const w = ratio ? Number(ratio[1]) : 16;
  const h = ratio ? Number(ratio[2]) : 9;
  if (!w || !h) return { width: 1344, height: 768 };
  // Keep the long edge at 1344px (sharp on retina, ~6 tiles) and snap to 64.
  const snap = (n: number) => Math.max(256, Math.min(1920, Math.round(n / 64) * 64));
  return w >= h ? { width: 1344, height: snap((1344 * h) / w) } : { width: snap((1344 * w) / h), height: 1344 };
}

/** Multipart form fields for a FLUX.2 [klein] text-to-image request. */
export function buildFlux2Form(prompt: string): FormData {
  const form = new FormData();
  const { width, height } = flux2Size(prompt);
  form.append("prompt", prompt.slice(0, 2048));
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("guidance", String(FLUX2_KLEIN_GUIDANCE));
  return form;
}

export type CloudflareImageBody =
  | { prompt: string }
  | { prompt: string; steps: number }
  | { prompt: string; negative_prompt: string }
  | { prompt: string; negative_prompt: string; num_steps: number; guidance: number }
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
    if (model && /stable-diffusion-xl-base/i.test(model))
      return { prompt, negative_prompt: PHOTO_NEGATIVE_PROMPT, num_steps: SDXL_BASE_STEPS, guidance: SDXL_GUIDANCE };
    if (model && /stable-diffusion|dreamshaper/i.test(model)) return { prompt, negative_prompt: PHOTO_NEGATIVE_PROMPT };
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
