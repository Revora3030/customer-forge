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

export type CloudflareImageBody =
  | { prompt: string }
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
): CloudflareImageBody {
  if (!source) return { prompt };
  return {
    prompt,
    image: byteArray(source.dataUrl),
    mask: byteArray(FULL_COVERAGE_MASK_PNG_BASE64),
    strength: EDIT_STRENGTH,
    num_steps: EDIT_STEPS,
  };
}
