/**
 * Data-URL helpers shared by provider adapters and the AI helpers that build
 * messages. Pure and provider-agnostic.
 */

/**
 * Normalizes picture input into a valid `data:<mime>;base64,<payload>` URL.
 *
 * Callers historically passed raw base64 in the `dataUrl` field. OpenAI-style
 * vision endpoints (Cloudflare Workers AI, OpenRouter, NVIDIA NIM, Hugging
 * Face) reject that with 400 "invalid image URL", which looked like a model
 * failure and burned the whole vision failover chain. An `http(s)` URL is
 * passed through untouched; whitespace inside base64 is stripped; a missing or
 * parameterised mime type falls back to the supplied one (or image/png).
 */
export function toImageDataUrl(input: string, mimeType?: string | null): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const fallbackMime = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() || "image/png";
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    if (comma < 0) return `data:${fallbackMime};base64,`;
    const header = value.slice(5, comma);
    const payload = value.slice(comma + 1).replace(/\s+/g, "");
    const declared = header.split(";")[0]?.trim().toLowerCase();
    const mime = declared && declared.includes("/") ? declared : fallbackMime;
    return /;base64/i.test(header) ? `data:${mime};base64,${payload}` : `data:${mime},${payload}`;
  }
  return `data:${fallbackMime};base64,${value.replace(/\s+/g, "")}`;
}
