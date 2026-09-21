/**
 * OpenAI adapter — Revora's own OpenAI key, called directly.
 *
 * Chat and vision go to `/v1/chat/completions`, images to `/v1/images/*`, and
 * audio to `/v1/audio/transcriptions`. Video frames are not supported by this
 * provider, so a video part is refused here and the router falls through to a
 * provider that can read it.
 */

import type { AiMessage, AiPart, AiUsage, ProviderAdapter } from "@/lib/ai/types";
import { RevoraAiError } from "@/lib/ai/errors";
import { bytesFromDataUrl, providerHttpError } from "@/lib/ai/providers/shared";

const BASE = "https://api.openai.com/v1";

type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

function partsOf(content: string | AiPart[]): string | OpenAiPart[] {
  if (typeof content === "string") return content;
  return content.map((part): OpenAiPart => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") return { type: "image_url", image_url: { url: part.dataUrl } };
    if (part.type === "audio") {
      const format = part.mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "webm";
      return {
        type: "input_audio",
        input_audio: { data: part.dataUrl.slice(part.dataUrl.indexOf(",") + 1), format },
      };
    }
    throw new RevoraAiError(400, "This Revora AI provider cannot read video.", {
      category: "invalid_request",
      provider: "openai",
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

/** GPT-5 era models take `max_completion_tokens` and reject a custom temperature. */
function isReasoningModel(model: string) {
  return /^(gpt-5|o\d)/i.test(model);
}

function isGpt56Model(model: string) {
  return /^gpt-5\.6-/i.test(model);
}

export const openAiAdapter: ProviderAdapter = {
  name: "openai",

  async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content: partsOf(message.content),
      })),
      ...(json ? { response_format: { type: "json_object" } } : {}),
      ...(isReasoningModel(model)
        ? {
            max_completion_tokens: maxOutputTokens,
            ...(isGpt56Model(model) ? { reasoning_effort: "none" } : {}),
          }
        : {
            max_tokens: maxOutputTokens,
            ...(typeof temperature === "number" ? { temperature } : {}),
          }),
    };
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw await providerHttpError("openai", response);
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: (payload.choices?.[0]?.message?.content ?? "").trim(), usage: usageOf(payload) };
  },

  async stream({ apiKey, model, messages, maxOutputTokens, signal }) {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        messages: messages.map((message) => ({
          role: message.role,
          content: partsOf(message.content),
        })),
        ...(isReasoningModel(model)
          ? {
              max_completion_tokens: maxOutputTokens,
              ...(isGpt56Model(model) ? { reasoning_effort: "none" } : {}),
            }
          : { max_tokens: maxOutputTokens }),
      }),
      signal,
    });
    if (!response.ok) throw await providerHttpError("openai", response);
    if (!response.body) throw new RevoraAiError(502, "Revora AI returned an empty stream.");
    return response.body;
  },

  async image({ apiKey, model, prompt, source, signal }) {
    let response: Response;
    if (source) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append(
        "image",
        new Blob([bytesFromDataUrl(source.dataUrl)], { type: source.mimeType }),
        "source.png",
      );
      response = await fetch(`${BASE}/images/edits`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
    } else {
      response = await fetch(`${BASE}/images/generations`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1 }),
        signal,
      });
    }
    if (!response.ok) throw await providerHttpError("openai", response);
    const payload = (await response.json()) as { data?: { b64_json?: string }[] };
    const base64 = payload.data?.[0]?.b64_json;
    if (!base64)
      throw new RevoraAiError(502, "Revora AI returned no image. Try again.", {
        category: "bad_response",
        provider: "openai",
      });
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
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
    if (!response.ok) throw await providerHttpError("openai", response);
    const payload = (await response.json()) as { text?: string };
    return { text: (payload.text ?? "").trim() };
  },
};
