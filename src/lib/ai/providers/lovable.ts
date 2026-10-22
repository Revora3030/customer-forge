/**
 * Lovable AI Gateway adapter — the owner's Lovable workspace key, billed to
 * that workspace's credits.
 *
 * Chat and vision go to `/v1/chat/completions` with the gateway's own
 * vendor-prefixed model ids (`openai/gpt-6.1-sol`, `google/gemini-3.8-flash`).
 * The Anthropic models on the gateway answer only on `/v1/messages`, so this
 * adapter never names one; adding Claude means a native Messages client, not a
 * model-id swap.
 *
 * Image generation and transcription are refused here: those roles stay on the
 * existing free image providers and the direct OpenAI lane this phase.
 *
 * Server-only. The key arrives from the router's provider config, read from
 * `LOVABLE_API_KEY` inside handlers; it is never shipped to the browser.
 */

import type { AiMessage, AiPart, AiUsage, ProviderAdapter } from "@/lib/ai/types";
import { RevoraAiError } from "@/lib/ai/errors";
import { providerHttpError } from "@/lib/ai/providers/shared";

const BASE = "https://ai.gateway.lovable.dev/v1";

type GatewayPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function partsOf(content: string | AiPart[]): string | GatewayPart[] {
  if (typeof content === "string") return content;
  return content.map((part): GatewayPart => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") return { type: "image_url", image_url: { url: part.dataUrl } };
    throw new RevoraAiError(400, "This Revora AI model can only read text and images.", {
      category: "invalid_request",
      provider: "lovable",
    });
  });
}

function headers(apiKey: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "Lovable-API-Key": apiKey,
    "X-Lovable-AIG-SDK": "fetch",
  };
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
 * Model ids carry their vendor prefix (`openai/gpt-6-sol`); the wire rules
 * below look at the bare model name. GPT-5/6 era models take
 * `max_completion_tokens` and reject a custom temperature; gpt-6 requires a
 * real reasoning effort while gpt-5.6 takes `none`.
 */
function bareModel(model: string) {
  return model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
}

function isReasoningModel(model: string) {
  return /^(gpt-5|gpt-6|o\d)/i.test(bareModel(model));
}

function reasoningEffortFor(model: string): Record<string, string> {
  const bare = bareModel(model);
  if (/^gpt-5\.6-/i.test(bare)) return { reasoning_effort: "none" };
  if (/^gpt-6/i.test(bare)) return { reasoning_effort: "low" };
  return {};
}

/** An empty answer (refusal, safety block, exhausted reasoning budget) is a failure, not a success. */
function answerOrThrow(text: string) {
  const trimmed = text.trim();
  if (!trimmed)
    throw new RevoraAiError(502, "Revora's AI model returned nothing.", {
      category: "bad_response",
      provider: "lovable",
    });
  return trimmed;
}

function unsupported(what: string): never {
  throw new RevoraAiError(403, `Revora's Lovable AI lane does not support ${what} yet.`, {
    category: "policy",
    provider: "lovable",
  });
}

function requestBody(input: {
  model: string;
  messages: AiMessage[];
  json?: boolean;
  maxOutputTokens: number;
  temperature?: number;
  stream?: boolean;
}) {
  const reasoning = isReasoningModel(input.model);
  return {
    model: input.model,
    ...(input.stream ? { stream: true } : {}),
    messages: input.messages.map((message) => ({
      role: message.role,
      content: partsOf(message.content),
    })),
    ...(input.json ? { response_format: { type: "json_object" } } : {}),
    ...(reasoning
      ? {
          max_completion_tokens: input.maxOutputTokens,
          ...reasoningEffortFor(input.model),
        }
      : {
          max_tokens: input.maxOutputTokens,
          ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
        }),
  };
}

export const lovableAdapter: ProviderAdapter = {
  name: "lovable",

  async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(
        requestBody({ model, messages, json, maxOutputTokens, ...(temperature !== undefined ? { temperature } : {}) }),
      ),
      signal,
    });
    if (!response.ok) throw await providerHttpError("lovable", response);
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: answerOrThrow(payload.choices?.[0]?.message?.content ?? ""), usage: usageOf(payload) };
  },

  async stream({ apiKey, model, messages, maxOutputTokens, signal }) {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(requestBody({ model, messages, maxOutputTokens, stream: true })),
      signal,
    });
    if (!response.ok) throw await providerHttpError("lovable", response);
    if (!response.body)
      throw new RevoraAiError(502, "Revora AI returned an empty stream.", {
        category: "bad_response",
        provider: "lovable",
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
