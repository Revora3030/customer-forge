/**
 * Presence-only readiness of the free image services for the Jarvis panel.
 * Lives in the server-side AI layer, the only place allowed to read AI
 * provider secrets. Returns booleans, never values.
 */
export function jarvisImageReadiness() {
  const env = process.env;
  return {
    "image.cloudflare": Boolean(env["CLOUDFLARE_ACCOUNT_ID"] && (env["CLOUDFLARE_AI_API_TOKEN"] || env["CLOUDFLARE_API_TOKEN"])),
    "image.huggingface": Boolean(env["HUGGINGFACE_API_KEY"] || env["HF_TOKEN"]),
    "image.pollinations": Boolean(env["POLLINATIONS_API_KEY"]),
  };
}
