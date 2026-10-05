/**
 * VISION CAPABILITY GATE.
 *
 * The vision role used to accept anything a loose name regex (or the "rest of
 * the pool" tail of discovery) offered, so text-only models such as
 * `@cf/zai-org/glm-5.2` or `gpt-oss-120b` were sent pictures. They either
 * answered 400/401 or hung until the 60-90s timeout, and every visual review
 * walked a long chain of models that could never see the frame.
 *
 * A model is vision-capable only when its id names a multimodal family that
 * is verified to read images. Text-only families are rejected explicitly even
 * if another token in the name would match.
 */
import type { FreeProviderName } from "@/lib/ai/free";

const VISION_MODEL =
  /vision|-vl\b|-vl-|[-_/]vl\d|\bvl-|llava|moondream|internvl|pixtral|multimodal|llama-4-(?:scout|maverick)|gemini-[\d.]+-(?:flash|pro)|gemini-(?:flash|pro)|gemma-3|gpt-4o|gpt-4\.1|gpt-5|omni|phi-[\d.]+-(?:multimodal|vision)/i;
const TEXT_ONLY_MODEL =
  /glm(?!.*(?:-?4v|-?4\.\dv|vision))|gpt-oss|deepseek|qwen(?:\d(?:\.\d)?)?-?coder|codestral|coder|nemotron(?!.*vl)|mistral-nemo|ministral|command|north|kimi(?!.*vl)|minimax|ling-(?!.*-vl)|transcribe|whisper|flux|stable-diffusion|sdxl|dreamshaper|lightning|embed|guard/i;

export function visionCapableModel(model: string): boolean {
  const name = model.trim();
  if (!name) return false;
  if (!VISION_MODEL.test(name)) return false;
  // Explicit vision markers win over a broad text-only family match
  // (e.g. "ling-3.0-flash-vl" or "qwen2.5-vl").
  if (/vision|-vl\b|-vl-|[-_/]vl\d|llava|internvl|pixtral/i.test(name)) return true;
  return !TEXT_ONLY_MODEL.test(name);
}

/**
 * Fast, high-accuracy free vision models, best first. The router puts these at
 * the front of the visual-review chain when the provider is configured, so the
 * ~600ms NIM endpoint answers before a slower general multimodal model.
 */
export const PREFERRED_FREE_VISION_MODELS: ReadonlyArray<{ provider: FreeProviderName; model: string }> = [
  { provider: "nvidia", model: "meta/llama-3.2-11b-vision-instruct" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.2-11b-vision-instruct" },
  { provider: "cloudflare", model: "@cf/meta/llama-4-scout-17b-16e-instruct" },
  { provider: "google", model: "gemini-2.5-flash" },
];

/** Rank of a model in the preferred fast-vision list (lower is better). */
export function preferredVisionRank(provider: string, model: string): number {
  const index = PREFERRED_FREE_VISION_MODELS.findIndex(
    (entry) => entry.provider === provider && entry.model === model,
  );
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}
