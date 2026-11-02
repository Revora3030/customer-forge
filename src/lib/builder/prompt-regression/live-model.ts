/**
 * Optional live mode: sends the builder's real prompts to an
 * OpenAI-style chat-completions endpoint you name, so a person can see how a real model answers them. It is OFF by
 * default, never runs in CI (the live test file refuses when CI is set) and
 * needs no repository secret: the key comes from the developer's own
 * environment. It bypasses the budget ledger, so keep runs small.
 */
import type { ModelFn } from "./thinker-route";

/** Why live mode cannot run, or null when it may. */
export function liveModeBlocker(env: Record<string, string | undefined>): string | null {
  if (env["PROMPT_REGRESSION_LIVE"] !== "1") return "set PROMPT_REGRESSION_LIVE=1 to turn live mode on";
  if (env["CI"]) return "live mode never runs in CI";
  if (!env["PROMPT_REGRESSION_URL"]) return "set PROMPT_REGRESSION_URL to a chat-completions endpoint";
  if (!env["PROMPT_REGRESSION_API_KEY"]) return "set PROMPT_REGRESSION_API_KEY in your own shell";
  if (!env["PROMPT_REGRESSION_MODEL"]) return "set PROMPT_REGRESSION_MODEL to a model id that endpoint accepts";
  return null;
}

export function liveModel(env: Record<string, string | undefined>): ModelFn {
  const blocker = liveModeBlocker(env);
  if (blocker) throw new Error(`live mode is off: ${blocker}`);
  const key = env["PROMPT_REGRESSION_API_KEY"]!;
  const url = env["PROMPT_REGRESSION_URL"]!;
  const model = env["PROMPT_REGRESSION_MODEL"]!;
  return async (request) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`endpoint answered ${response.status}`);
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("endpoint returned no text");
    return text;
  };
}
