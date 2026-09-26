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
  return /^(gpt-5|gpt-6|o\d)/i.test(model);
}

/** gpt-5.6 takes `none`; gpt-6 requires a real effort, so it gets `low`. */
function reasoningEffortFor(model: string): Record<string, string> {
  if (/^gpt-5\.6-/i.test(model)) return { reasoning_effort: "none" };
  if (/^gpt-6-/i.test(model)) return { reasoning_effort: "low" };
  return {};
}


/** Pro-tier models (gpt-5.x-pro, o1-pro, o3-pro) answer only on `/v1/responses`. */
export function isResponsesOnlyModel(model: string) {
  return /(^o\d+-pro$)|(^gpt-5(\.\d+)?-pro$)/i.test(model);
}

function responsesInput(messages: AiMessage[]) {
  return messages.map((message) => {
    const role = message.role === "system" ? "developer" : message.role;
    if (typeof message.content === "string") return { role, content: message.content };
    return {
      role,
      content: message.content.map((part) => {
        if (part.type === "text") return { type: message.role === "assistant" ? "output_text" : "input_text", text: part.text };
        if (part.type === "image") return { type: "input_image", image_url: part.dataUrl };
        throw new RevoraAiError(400, "This Revora AI model can only read text and images.", {
          category: "invalid_request",
          provider: "openai",
        });
      }),
    };
  });
}

/** Streams a Responses call and yields text deltas; errors surface honestly. */
async function* responsesDeltas(input: {
  apiKey: string; model: string; messages: AiMessage[]; json?: boolean | undefined;
  maxOutputTokens?: number | undefined; signal?: AbortSignal | undefined;
}): AsyncGenerator<string, AiUsage> {
  const response = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      store: false,
      input: responsesInput(input.messages),
      ...(input.maxOutputTokens ? { max_output_tokens: input.maxOutputTokens } : {}),
      ...(input.json ? { text: { format: { type: "json_object" } } } : {}),
    }),
    signal: input.signal ?? null,
  });
  if (!response.ok) throw await providerHttpError("openai", response);
  if (!response.body) throw new RevoraAiError(502, "Revora AI returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: AiUsage = { inputTokens: null, outputTokens: null };
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: { type?: string; delta?: string; response?: { usage?: Record<string, number>; error?: { message?: string } } };
      try { event = JSON.parse(payload); } catch { continue; }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") yield event.delta;
      else if (event.type === "response.failed" || event.type === "error") {
        throw new RevoraAiError(502, event.response?.error?.message ?? "Revora AI stream failed.", { provider: "openai" });
      } else if (event.type === "response.completed") {
        const u = event.response?.usage;
        usage = {
          inputTokens: typeof u?.["input_tokens"] === "number" ? u["input_tokens"] : null,
          outputTokens: typeof u?.["output_tokens"] === "number" ? u["output_tokens"] : null,
        };
      }
    }
  }
  return usage;
}

export const openAiAdapter: ProviderAdapter = {
  name: "openai",

  async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
    if (isResponsesOnlyModel(model)) {
      const deltas = responsesDeltas({ apiKey, model, messages, json, maxOutputTokens, signal });
      let text = "";
      for (;;) {
        const next = await deltas.next();
        if (next.done) return { text: text.trim(), usage: next.value };
        text += next.value;
      }
    }
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
            ...reasoningEffortFor(model),
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
    if (isResponsesOnlyModel(model)) {
      // Re-emit Responses deltas in the chat-completions stream shape callers read.
      const deltas = responsesDeltas({ apiKey, model, messages, maxOutputTokens, signal });
      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await deltas.next();
            if (next.done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            const frame = { choices: [{ delta: { content: next.value } }] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          await deltas.return({ inputTokens: null, outputTokens: null });
        },
      });
    }
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
              ...reasoningEffortFor(model),
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

/**
 * Asks the account whether a model is actually reachable, WITHOUT generating
 * anything (so it costs nothing). Used to prove premium picture availability
 * instead of assuming it from a model name. Only the router calls this.
 */
export async function openaiModelReachable(
  apiKey: string,
  model: string,
): Promise<{ available: boolean; status: number | null }> {
  try {
    const response = await fetch(`${BASE}/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return { available: response.ok, status: response.status };
  } catch {
    return { available: false, status: null };
  }
}

/* ------------------------------- video lane -------------------------------- */

export type OpenAiVideoOutcome =
  | { ok: true; bytes: Uint8Array }
  | {
      ok: false;
      /** `charged` says whether the job actually ran before it failed. */
      kind: "model_unavailable" | "provider_error" | "timed_out" | "invalid_video";
      detail: string;
      charged: boolean;
    };

/**
 * Renders ONE silent clip on the account's own video model: starts the job,
 * waits for it, then downloads the finished file. No timer abort on the create
 * call, because an aborted render is still billed while producing nothing. Only
 * the router calls this.
 */
export async function openaiVideo(
  apiKey: string,
  input: { model: string; prompt: string; seconds: number; size: string },
  waiting: { maxWaitMs: number; pollMs: number },
): Promise<OpenAiVideoOutcome> {
  type JobState = { id?: string; status?: string; error?: { message?: string } | null };
  const auth = { Authorization: `Bearer ${apiKey}` };
  try {
    const created = await fetch(`${BASE}/videos`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        seconds: String(input.seconds),
        size: input.size,
      }),
    });
    if (!created.ok) {
      let detail = `HTTP ${created.status}`;
      try {
        const body = (await created.json()) as { error?: { message?: string } };
        if (typeof body.error?.message === "string") detail = body.error.message;
      } catch {
        /* keep the status as the detail */
      }
      return {
        ok: false,
        kind: created.status === 403 || created.status === 404 ? "model_unavailable" : "provider_error",
        detail: detail.slice(0, 160),
        charged: false,
      };
    }
    let state = (await created.json()) as JobState;
    if (!state.id)
      return { ok: false, kind: "provider_error", detail: "no job was started", charged: false };

    const started = Date.now();
    while (state.status !== "completed" && state.status !== "failed") {
      if (Date.now() - started > waiting.maxWaitMs)
        return { ok: false, kind: "timed_out", detail: "render took too long", charged: true };
      await new Promise((resolve) => setTimeout(resolve, waiting.pollMs));
      const polled = await fetch(`${BASE}/videos/${state.id}`, { headers: auth });
      if (!polled.ok)
        return { ok: false, kind: "provider_error", detail: "job could not be checked", charged: true };
      state = (await polled.json()) as JobState;
    }
    if (state.status === "failed")
      return {
        ok: false,
        kind: "provider_error",
        detail: (state.error?.message ?? "the render failed").slice(0, 160),
        charged: true,
      };

    const content = await fetch(`${BASE}/videos/${state.id}/content`, { headers: auth });
    if (!content.ok)
      return { ok: false, kind: "provider_error", detail: "the clip could not be downloaded", charged: true };
    const bytes = new Uint8Array(await content.arrayBuffer());
    if (bytes.byteLength < 10_000)
      return { ok: false, kind: "invalid_video", detail: "the clip was empty", charged: true };
    return { ok: true, bytes };
  } catch {
    return {
      ok: false,
      kind: "provider_error",
      detail: "the video service could not be reached",
      charged: false,
    };
  }
}

