/**
 * Presence-only readiness of picture making for the Jarvis panel. Pictures run
 * on Lovable AI image models. Returns booleans, never values.
 */
export function jarvisImageReadiness() {
  return { "image.lovable": Boolean(process.env["LOVABLE_API_KEY"]) };
}
