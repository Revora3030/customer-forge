/**
 * Adapter factory for providers that speak the OpenAI chat-completions wire
 * format. Cloudflare Workers AI and OpenRouter both do, so one implementation
 * serves both and a further OpenAI-compatible free provider needs only a base
 * URL and a name.
 *
 * Image generation and transcription are not offered here: the factory refuses
 * them with a non-retryable error so the router moves on to another compatible
 * provider or reports the capability as unavailable.
 */

import type { ProviderName } from "@/lib/ai/config";
import { RevoraAiError } from "@/lib/ai/errors";
import { providerHttpError } from "@/lib/ai/providers/shared";
import type { AiPart, AiUsage, ProviderAdapter } from "@/lib/ai/types";

type CompatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function partsOf(provider: ProviderName, content: string | AiPart[]): string | CompatPart[] {
  if (typeof content === "string") return content;
  return content.map((part): CompatPart => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") return { type: "image_url", image_url: { url: part.dataUrl } };
    throw new RevoraAiError(403, `Revora's ${provider} free models cannot read that attachment.`, {
      category: "policy",
      provider,
    });
  });
}

function usageOf(payload: unknown): AiUsage {
  const usage = (payload as { usage?: Record<string, number> } | null)?.usage;
  return {
    inputTokens: typeof usage?.["prompt_tokens"] === "number" ? usage["prompt_tokens"] : null,
    outputTokens:
      typeof usage?.["completion_tokens"] === "number" ? usage["completion_tokens"] : null,
  };
}

/**
 * Reasoning models on the free pool (DeepSeek R1, Qwen3, Nemotron, gpt-oss on
 * some hosts) put their private thinking inside the answer as <think> blocks.
 * That text must never reach a customer's site or a JSON parser.
 */
export function stripReasoning(raw: string): string {
  let text = raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  // An answer that opens a thinking block and never closes it was cut off
  // mid-thought; one that only closes it had the opening tag stripped upstream.
  const close = text.search(/<\/(think|thinking|reasoning)>/i);
  if (close >= 0) text = text.slice(text.indexOf(">", close) + 1);
  text = text.replace(/^\s*<(think|thinking|reasoning)>[\s\S]*$/i, "");
  return text.trim();
}

export type CompatAdapterOptions = {
  name: ProviderName;
  /** Resolved at call time so an account id can come from the environment. */
  baseUrl: () => string | null;
  extraHeaders?: () => Record<string, string>;
};

export function createOpenAiCompatibleAdapter(options: CompatAdapterOptions): ProviderAdapter {
  const { name } = options;

  function endpoint() {
    const base = options.baseUrl();
    if (!base)
      throw new RevoraAiError(503, `Revora's ${name} AI provider is not configured.`, {
        category: "not_configured",
        provider: name,
      });
    return `${base.replace(/\/$/, "")}/chat/completions`;
  }

  function headers(apiKey: string) {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Some providers sit behind an edge that refuses requests with no client
      // identity at all (Groq answers 403 "1010" to an unidentified client), so
      // Revora always identifies itself.
      "user-agent": "RevoraGrowthSystems/1.0 (+https://revoragrowthsystems.com)",
      accept: "application/json",
      ...(options.extraHeaders?.() ?? {}),
    };
  }

  function unsupported(what: string): never {
    throw new RevoraAiError(403, `Revora's free ${name} models do not support ${what}.`, {
      category: "policy",
      provider: name,
    });
  }

  return {
    name,

    async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
      let jsonMode = json === true;
      const send = (maxTokens: number | undefined) =>
        fetch(endpoint(), {
          method: "POST",
          headers: headers(apiKey),
          body: JSON.stringify({
            model,
            messages: messages.map((message) => ({
              role: message.role,
              content: partsOf(name, message.content),
            })),
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            ...(typeof temperature === "number" ? { temperature } : {}),
          }),
          signal,
        });
      let response = await send(maxOutputTokens);
      // Several free models refuse `response_format` outright. The prompt still
      // asks for JSON and the router parses it, so retry once without the flag
      // instead of losing this model for every structured call.
      if (!response.ok && response.status === 400 && jsonMode) {
        const detail = await response.clone().text().catch(() => "");
        if (/response_format|json_object|json mode|json_schema|structured output/i.test(detail)) {
          jsonMode = false;
          response = await send(maxOutputTokens);
        }
      }
      // Free models have smaller output ceilings and refuse a large max_tokens
      // with a 400. Retry once at a ceiling they all accept, then once with no
      // explicit cap, instead of failing the call outright.
      for (const fallback of [8192, undefined]) {
        if (response.ok || response.status !== 400 || !maxOutputTokens || (fallback && fallback >= maxOutputTokens)) break;
        const detail = await response.clone().text().catch(() => "");
        if (!/max_tokens|max_completion_tokens|maximum|context|too large|exceed/i.test(detail)) break;
        response = await send(fallback);
      }
      if (!response.ok) throw await providerHttpError(name, response);
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      if (payload.error?.message)
        throw new RevoraAiError(502, `Revora's ${name} free model returned an error.`, {
          category: "bad_response",
          provider: name,
          detail: payload.error.message.slice(0, 200),
        });
      const text = stripReasoning(payload.choices?.[0]?.message?.content ?? "");
      if (text.length === 0)
        throw new RevoraAiError(502, `Revora's ${name} free model returned nothing.`, {
          category: "bad_response",
          provider: name,
        });
      return { text, usage: usageOf(payload) };
    },

    async stream({ apiKey, model, messages, maxOutputTokens, signal }) {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: maxOutputTokens,
          messages: messages.map((message) => ({
            role: message.role,
            content: partsOf(name, message.content),
          })),
        }),
        signal,
      });
      if (!response.ok) throw await providerHttpError(name, response);
      if (!response.body)
        throw new RevoraAiError(502, `Revora's ${name} free model returned an empty stream.`, {
          category: "bad_response",
          provider: name,
        });
      return response.body;
    },

    async image() {
      return unsupported("image generation");
    },

    async transcribe() {
      return unsupported("transcription");
    },
  };
}
