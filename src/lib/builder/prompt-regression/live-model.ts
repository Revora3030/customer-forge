/**
 * Optional live mode: sends the builder's real prompts to the Lovable AI
 * gateway so a person can see how a real model answers them. It is OFF by
 * default, never runs in CI (the live test file refuses when CI is set) and
 * needs no repository secret: the key comes from the developer's own
 * environment. It bypasses the budget ledger, so keep runs small.
 */
import type { ModelFn } from "./thinker-route";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Why live mode cannot run, or null when it may. */
export function liveModeBlocker(env: Record<string, string | undefined>): string | null {
  if (env["PROMPT_REGRESSION_LIVE"] !== "1") return "set PROMPT_REGRESSION_LIVE=1 to turn live mode on";
  if (env["CI"]) return "live mode never runs in CI";
  if (!env["LOVABLE_API_KEY"]) return "set LOVABLE_API_KEY in your own shell";
  if (!env["PROMPT_REGRESSION_MODEL"]) return "set PROMPT_REGRESSION_MODEL to a gateway model id (an OpenAI-style one, e.g. the id the builder's router uses)";
  return null;
}

export function liveModel(env: Record<string, string | undefined>): ModelFn {
  const blocker = liveModeBlocker(env);
  if (blocker) throw new Error(`live mode is off: ${blocker}`);
  const key = env["LOVABLE_API_KEY"]!;
  const model = env["PROMPT_REGRESSION_MODEL"]!;
  return async (request) => {
    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`gateway answered ${response.status}`);
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("gateway returned no text");
    return text;
  };
}
