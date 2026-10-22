/**
 * Lovable AI Gateway adapter — the owner's Lovable workspace key, billed to
 * that workspace's credits.
 *
 * Chat and vision go to `/v1/chat/completions` with the gateway's own
 * vendor-prefixed model ids (`openai/gpt-6.1-sol`, `google/gemini-3.8-flash`).
 * Anthropic models answer only on the native `/v1/messages` endpoint, so this
 * adapter speaks both protocols and picks the wire format from the model id.
 *
 * Image generation and transcription are refused here: those roles stay on the
 * existing free image providers and the direct OpenAI lane this phase.
 *
 * Server-only. The key arrives from the router's provider config, read from
 * `LOVABLE_API_KEY` inside handlers; it is never shipped to the browser.
 */

import type { AiMessage, AiPart, AiUsage, ProviderAdapter } from "@/lib/ai/types";
import { RevoraAiError } from "@/lib/ai/errors";
import { base64ByteLength, base64FromDataUrl, bytesFromDataUrl, providerHttpError } from "@/lib/ai/providers/shared";

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

function isAnthropic(model: string) {
  return model.startsWith("anthropic/");
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

/* ------------------------------ Anthropic /v1/messages ------------------------------ */

type AnthropicPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/**
 * The Messages API refuses an image over 5 MB (decoded). A full-size PNG from
 * the picture lane can exceed it; refusing before the upload makes the router
 * move to the next roster model at once instead of paying for a 400.
 */
export const ANTHROPIC_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function anthropicPart(part: AiPart): AnthropicPart {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "image" && base64ByteLength(part.dataUrl) > ANTHROPIC_MAX_IMAGE_BYTES)
    throw new RevoraAiError(413, "That picture is larger than this Revora AI model accepts.", {
      category: "invalid_request",
      provider: "lovable",
    });
  if (part.type === "image")
    return {
      type: "image",
      source: { type: "base64", media_type: part.mimeType, data: base64FromDataUrl(part.dataUrl) },
    };
  throw new RevoraAiError(400, "This Revora AI model can only read text and images.", {
    category: "invalid_request",
    provider: "lovable",
  });
}

/**
 * The Messages API takes system prompts as a top-level field, not a message.
 * Sampling parameters are never sent: Claude 4.7-and-later models (every
 * anthropic/* id on the roster) answer 400 to any `temperature`, which used to
 * fail every Claude call a caller passed a temperature to.
 */
export function anthropicRequest(input: {
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
}) {
  const system: string[] = [];
  const messages: { role: "user" | "assistant"; content: string | AnthropicPart[] }[] = [];
  for (const message of input.messages) {
    if (message.role === "system") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((part): part is Extract<AiPart, { type: "text" }> => part.type === "text")
              .map((part) => part.text)
              .join("\n");
      if (text.trim()) system.push(text);
      continue;
    }
    messages.push({
      role: message.role,
      content:
        typeof message.content === "string" ? message.content : message.content.map(anthropicPart),
    });
  }
  return {
    model: input.model,
    max_tokens: input.maxOutputTokens,
    ...(system.length > 0 ? { system: system.join("\n\n") } : {}),
    messages,
  };
}

async function anthropicChat(input: {
  apiKey: string;
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
}): Promise<{ text: string; usage: AiUsage }> {
  const response = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: { ...headers(input.apiKey), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(
      anthropicRequest({
        model: input.model,
        messages: input.messages,
        maxOutputTokens: input.maxOutputTokens,
      }),
    ),
    signal: input.signal,
  });
  if (!response.ok) throw await providerHttpError("lovable", response);
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // A refusal is terminal for this model: report it as a failed answer so the
  // router moves on, and never present an empty reply as success.
  if (payload.stop_reason === "refusal")
    throw new RevoraAiError(502, "Revora's AI model declined to answer.", {
      category: "bad_response",
      provider: "lovable",
    });
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  return {
    text: answerOrThrow(text),
    usage: {
      inputTokens: typeof payload.usage?.input_tokens === "number" ? payload.usage.input_tokens : null,
      outputTokens:
        typeof payload.usage?.output_tokens === "number" ? payload.usage.output_tokens : null,
    },
  };
}

/** Stream consumers read chat-completions SSE; wrap a Messages answer in that shape. */
function openAiSseStream(text: string): ReadableStream<Uint8Array> {
  const chunk = {
    id: "chatcmpl-lovable-messages",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: "stop" }],
  };
  const sse = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
  return new Response(sse, { headers: { "content-type": "text/event-stream" } }).body!;
}

export const lovableAdapter: ProviderAdapter = {
  name: "lovable",

  async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
    if (isAnthropic(model)) return anthropicChat({ apiKey, model, messages, maxOutputTokens, signal });
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
    if (isAnthropic(model)) {
      const { text } = await anthropicChat({ apiKey, model, messages, maxOutputTokens, signal });
      return openAiSseStream(text);
    }
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

  // Pictures use the gateway's OpenAI-format image endpoints. Server-side and
  // final-only, so the request is not streamed; the caller's deadline bounds it.
  async image({ apiKey, model, prompt, source, signal }) {
    let response: Response;
    if (source) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      form.set("image", new Blob([bytesFromDataUrl(source.dataUrl)], { type: source.mimeType }), "source.png");
      const { "content-type": _omit, ...auth } = headers(apiKey);
      response = await fetch(`${BASE}/images/edits`, { method: "POST", headers: auth, body: form, signal });
    } else {
      response = await fetch(`${BASE}/images/generations`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({ model, prompt }),
        signal,
      });
    }
    if (!response.ok) throw await providerHttpError("lovable", response);
    const body = (await response.json()) as { data?: { b64_json?: string }[] };
    const base64 = body.data?.[0]?.b64_json;
    if (!base64)
      throw new RevoraAiError(502, "The picture model returned no image.", { category: "bad_response", provider: "lovable" });
    return { base64, mimeType: "image/png" };
  },

  async transcribe({ apiKey, model, audio, signal }) {
    const extension = audio.mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "webm";
    const form = new FormData();
    form.append("model", model);
    form.append(
      "file",
      new Blob([bytesFromDataUrl(audio.dataUrl)], { type: audio.mimeType }),
      `${audio.name || "voice"}.${extension}`,
    );
    const response = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey },
      body: form,
      signal,
    });
    if (!response.ok) throw await providerHttpError("lovable", response);
    const payload = (await response.json()) as { text?: string };
    return { text: (payload.text ?? "").trim() };
  },
};
