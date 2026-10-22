/**
 * Jarvis's Lovable chat roster, strongest first. Browser-safe so the admin
 * model picker shows exactly the ids the router can try. Every id is in the
 * live catalogue, not deprecated, and zero-retention (or an allowed anthropic id).
 */
export const LOVABLE_CONVERSATION_MODELS = [
  "openai/gpt-6.1-sol",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5-5",
  "openai/gpt-6-sol",
  "google/gemini-3.8-flash",
  "anthropic/claude-fable-5-1",
  "google/gemini-4-argon",
  "openai/gpt-6-astra",
  "google/gemini-3.1-pro-preview",
  "openai/gpt-5.5",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.4-mini",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.4",
] as const;

/** The owner-picked model, or null for "Auto". Unknown ids are ignored, never forwarded. */
export function parsePickedModel(value: unknown): string | null {
  return typeof value === "string" && (LOVABLE_CONVERSATION_MODELS as readonly string[]).includes(value) ? value : null;
}

/** "anthropic/claude-sonnet-5" -> "Claude Sonnet 5" for display. */
export function modelDisplayName(id: string): string {
  const name = id.split("/").pop() ?? id;
  return name.split("-").map(part => (/^gpt$/i.test(part) ? "GPT" : part.charAt(0).toUpperCase() + part.slice(1))).join(" ").replace(/(\d) (\d)/g, "$1.$2");
}
