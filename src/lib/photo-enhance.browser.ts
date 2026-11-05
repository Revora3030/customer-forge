/**
 * CG-09 browser wrapper: runs the pure touch-up in a canvas. Falls back to the
 * untouched file on any problem, so an upload is never blocked by this step.
 */
import { analyzeRgba, applyEnhancement, enhanceNote, planEnhancement, type EnhanceResult } from "@/lib/photo-enhance";

export type EnhancedPhoto = { file: File; original: File; changed: boolean; note: string };

const QUALITY = 0.9;

export async function enhancePhotoFile(file: File): Promise<EnhancedPhoto> {
  const untouched = (note = "Left as is.") => ({ file, original: file, changed: false, note });
  if (typeof document === "undefined" || !/^image\/(jpeg|png|webp)$/.test(file.type)) return untouched();
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return untouched();
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const before = analyzeRgba(image.data);
    const plan = planEnhancement(before);
    const changed = applyEnhancement(image.data, plan);
    const result: EnhanceResult = { changed, plan, before, after: before };
    if (!changed) return untouched(enhanceNote(result));
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return untouched();
    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${stem}.jpg`, { type: "image/jpeg" }),
      original: file,
      changed: true,
      note: enhanceNote(result),
    };
  } catch {
    return untouched();
  }
}
