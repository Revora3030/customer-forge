/**
 * Picture request size for a slot's aspect ratio ("16:9", "4:5", "1:1").
 * Uses the three sizes the gateway's OpenAI-format image models accept, so a
 * wide hero is generated wide instead of cropped out of a square.
 */
export type ImageRequestSize = "1536x1024" | "1024x1536" | "1024x1024";

export function imageSizeForAspect(aspect: string | null | undefined): ImageRequestSize {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(aspect ?? "");
  if (!match) return "1536x1024";
  const ratio = Number(match[1]) / Number(match[2]);
  if (!Number.isFinite(ratio) || ratio <= 0) return "1536x1024";
  if (ratio >= 1.15) return "1536x1024";
  if (ratio <= 0.87) return "1024x1536";
  return "1024x1024";
}
