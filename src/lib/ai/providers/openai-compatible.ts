/**
 * Adapter factory for providers that speak the OpenAI chat-completions wire
 * format. Cloudflare Workers AI and OpenRouter both do, so one implementation
 * serves both and a further OpenAI-compatible free provider needs only a base
 * URL and a name.
 *
 * Image generation and transcription are not offered here: the factory refuses
 * them with a non-retryable error so the router moves straight on to a provider
 * (or Revora's native engine) that can do the work.
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
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          model,
          messages: messages.map((message) => ({
            role: message.role,
            content: partsOf(name, message.content),
          })),
          max_tokens: maxOutputTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          ...(typeof temperature === "number" ? { temperature } : {}),
        }),
        signal,
      });
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
      const text = (payload.choices?.[0]?.message?.content ?? "").trim();
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
