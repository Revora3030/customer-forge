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
import { base64FromDataUrl, bytesFromDataUrl, providerHttpError } from "@/lib/ai/providers/shared";

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

/**
 * Speed-first effort for every thinking model: the builder makes many short
 * calls under a per-request time limit, so default (high) thinking times out.
 */
function reasoningEffortFor(model: string): Record<string, string> {
  const bare = bareModel(model);
  if (/^gpt-5\.6-/i.test(bare)) return { reasoning_effort: "none" };
  if (/^(gpt-5|gpt-6|o\d)/i.test(bare)) return { reasoning_effort: "low" };
  if (/^gemini-(2\.5|3)/i.test(bare) && !/image|tts|embedding/i.test(bare)) return { reasoning_effort: "low" };
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

/**
 * The gateway refuses `response_format: json_object` unless the prompt itself
 * contains the word "json" (HTTP 400, seen on plan_review). When it does not,
 * say so once, in the first system message, rather than failing the step.
 */
export function withJsonWord(messages: AiMessage[]): AiMessage[] {
  const says = (message: AiMessage) =>
    typeof message.content === "string"
      ? /json/i.test(message.content)
      : message.content.some((part) => part.type === "text" && /json/i.test(part.text));
  if (messages.some(says)) return messages;
  const note = "Respond with a single JSON object.";
  const at = messages.findIndex((message) => message.role === "system" && typeof message.content === "string");
  if (at < 0) return [{ role: "system", content: note }, ...messages];
  return messages.map((message, index) =>
    index === at ? { ...message, content: `${message.content as string}\n\n${note}` } : message,
  );
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
    messages: (input.json ? withJsonWord(input.messages) : input.messages).map((message) => ({
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
          ...reasoningEffortFor(input.model),
          ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
        }),
  };
}

/** A model answer cut off at the output limit: reported as a failure so the router fails over. */
function truncated() {
  return new RevoraAiError(502, "Revora's AI model ran out of room before finishing its answer.", {
    category: "bad_response",
    provider: "lovable",
  });
}

/* ------------------------- chat-completions streaming ------------------------- */

/**
 * A streamed answer that has produced nothing at all for this long is stuck,
 * not slow: the first token of a reasoning model can take a while, so the
 * first wait is longer than the gaps between later chunks.
 */
export const STREAM_FIRST_CHUNK_MS = 100_000;
export const STREAM_IDLE_MS = 45_000;

/** Set once the gateway rejects `stream_options`, so later calls skip it. */
let streamUsageOptionRejected = false;
/** Models the gateway refused to stream; they use the plain request from then on. */
const streamRefusedFor = new Set<string>();

/** `AI_LOVABLE_STREAM=off` sends every call the old, non-streamed way (an operator switch, no deploy of code needed). */
function streamingSwitchedOff() {
  return /^(off|false|0|no)$/i.test(process.env["AI_LOVABLE_STREAM"]?.trim() ?? "");
}

/** One read that gives up when the model goes quiet, instead of waiting out the whole attempt. */
async function readStreamChunk(reader: ReadableStreamDefaultReader<Uint8Array>, idleMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout( // DevSkim: ignore DS172411 -- Fixed callback and a numeric delay; no untrusted data.
      () =>
        reject(
          new RevoraAiError(408, "Revora AI stopped answering partway through. Try again.", {
            category: "timeout",
            provider: "lovable",
          }),
        ),
      idleMs,
    );
  });
  try {
    return await Promise.race([reader.read(), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a chat-completions SSE stream to the end: answer text, finish reason
 * and usage. Long answers are streamed so they never sit on one silent
 * connection: the gateway's edge answers 524 to a request that takes about two
 * minutes to produce its first byte, which a long creative answer on a slow
 * model easily does. The answer is accumulated here and returned whole.
 */
export async function readChatStream(
  stream: ReadableStream<Uint8Array>,
  limits: { firstChunkMs?: number; idleMs?: number } = {},
): Promise<{ text: string; finishReason: string | null; usage: AiUsage }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason: string | null = null;
  let usage: AiUsage = { inputTokens: null, outputTokens: null };
  const handle = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") return;
    let event: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (event["error"])
      throw new RevoraAiError(502, "Revora's AI model stopped with an error.", {
        category: "bad_response",
        provider: "lovable",
        detail: String(event["error"]?.message ?? event["error"]).slice(0, 200),
      });
    const choice = event["choices"]?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string") text += delta;
    else if (typeof choice?.message?.content === "string" && !text) text = choice.message.content;
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    if (event["usage"]) usage = usageOf(event);
  };
  let first = true;
  try {
    for (;;) {
      const { done, value } = await readStreamChunk(
        reader,
        first ? (limits.firstChunkMs ?? STREAM_FIRST_CHUNK_MS) : (limits.idleMs ?? STREAM_IDLE_MS),
      );
      first = false;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const separator = buffer.slice(cut).match(/^\r?\n\r?\n/)![0];
        handle(buffer.slice(0, cut));
        buffer = buffer.slice(cut + separator.length);
      }
    }
    if (buffer.trim()) handle(buffer);
  } catch (error) {
    // A stalled or failed read leaves the connection open; release it.
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return { text, finishReason, usage };
}

type ChatMode = "stream_with_usage" | "stream" | "plain";

/**
 * Sends one chat-completions request. Streamed by default (see readChatStream);
 * if the gateway refuses `stream_options` the same request is sent without it,
 * and if it refuses to stream this model at all the request is sent the old,
 * plain way and remembered for that model. A request that is simply malformed
 * fails the same way in every mode and is reported as it always was.
 */
async function openChat(input: {
  apiKey: string;
  model: string;
  messages: AiMessage[];
  json: boolean;
  maxOutputTokens: number;
  temperature?: number;
  signal: AbortSignal;
}): Promise<Response> {
  const send = (mode: ChatMode) =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: mode === "plain" ? headers(input.apiKey) : { ...headers(input.apiKey), accept: "text/event-stream" },
      body: JSON.stringify({
        ...requestBody({
          model: input.model,
          messages: input.messages,
          json: input.json,
          maxOutputTokens: input.maxOutputTokens,
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          ...(mode === "plain" ? {} : { stream: true }),
        }),
        ...(mode === "stream_with_usage" ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: input.signal,
    });
  const rejected = (response: Response) => response.status === 400 || response.status === 422;

  let mode: ChatMode =
    streamingSwitchedOff() || streamRefusedFor.has(input.model)
      ? "plain"
      : streamUsageOptionRejected
        ? "stream"
        : "stream_with_usage";
  let response = await send(mode);
  if (mode === "stream_with_usage" && rejected(response)) {
    const body = await response.clone().text().catch(() => "");
    if (/stream_options|include_usage/i.test(body)) {
      streamUsageOptionRejected = true;
      mode = "stream";
      response = await send(mode);
    }
  }
  if (mode !== "plain" && rejected(response)) {
    const plain = await send("plain");
    // Only a plain request that works where the streamed one did not proves the
    // gateway refused streaming; otherwise the request itself was at fault.
    if (plain.ok) {
      streamRefusedFor.add(input.model);
      return plain;
    }
    await plain.body?.cancel().catch(() => undefined);
    return response;
  }
  return response;
}

/* ------------------------------ Anthropic /v1/messages ------------------------------ */

type AnthropicPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function anthropicPart(part: AiPart): AnthropicPart {
  if (part.type === "text") return { type: "text", text: part.text };
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

/** Reads a Messages SSE stream to the end: answer text, stop reason and usage. */
async function readAnthropicStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stop_reason: string | undefined;
  const usage: { input_tokens?: number; output_tokens?: number } = {};
  const handle = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) return;
    let event: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (event["type"] === "error")
      throw new RevoraAiError(502, "Revora's AI model stopped with an error.", { category: "bad_response", provider: "lovable" });
    if (event["type"] === "message_start" && typeof event["message"]?.usage?.input_tokens === "number")
      usage.input_tokens = event["message"].usage.input_tokens;
    if (event["type"] === "content_block_delta" && event["delta"]?.type === "text_delta")
      text += String(event["delta"].text ?? "");
    if (event["type"] === "message_delta") {
      if (typeof event["delta"]?.stop_reason === "string") stop_reason = event["delta"].stop_reason;
      if (typeof event["usage"]?.output_tokens === "number") usage.output_tokens = event["usage"].output_tokens;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      handle(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
    }
  }
  if (buffer.trim()) handle(buffer);
  return { text, stop_reason, usage };
}

/**
 * Claude models with adaptive thinking take minutes at the default effort.
 * The builder runs many short calls, so it asks for low effort: fast answers
 * that still think (owner wants Lovable-like speed, 2026-10-22).
 */
function anthropicEffort(model: string) {
  if (!/claude-(opus|sonnet|fable)/.test(model)) return {};
  // Fable is the whole-site reviewer, where depth matters more than speed. It
  // stays at low until the owner measures the latency and sets AI_FABLE_EFFORT.
  const requested = /claude-fable/.test(model) ? process.env["AI_FABLE_EFFORT"]?.trim().toLowerCase() : undefined;
  const effort = requested === "medium" || requested === "high" ? requested : "low";
  return { output_config: { effort } };
}

/** The Messages API takes system prompts as a top-level field, not a message. */
function anthropicRequest(input: {
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
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
    ...anthropicEffort(input.model),
    ...(system.length > 0 ? { system: system.join("\n\n") } : {}),
    messages,
    ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
  };
}

async function anthropicChat(input: {
  apiKey: string;
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
  signal: AbortSignal;
}): Promise<{ text: string; usage: AiUsage }> {
  const body = anthropicRequest({
    model: input.model,
    messages: input.messages,
    maxOutputTokens: input.maxOutputTokens,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
  });
  const response = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: { ...headers(input.apiKey), "anthropic-version": "2023-06-01", accept: "text/event-stream" },
    // Streamed so long answers never sit on an idle connection; the answer is
    // accumulated here and returned whole (final-only callers).
    body: JSON.stringify({ ...body, stream: true }),
    signal: input.signal,
  });
  if (!response.ok) throw await providerHttpError("lovable", response);
  if (!response.body)
    throw new RevoraAiError(502, "Revora AI returned an empty stream.", { category: "bad_response", provider: "lovable" });
  const payload = await readAnthropicStream(response.body);
  const text = payload.text;
  // A refusal is terminal for this model: report it as a failed answer so the
  // router moves on, and never present an empty reply as success.
  if (payload.stop_reason === "refusal")
    throw new RevoraAiError(502, "Revora's AI model declined to answer.", {
      category: "bad_response",
      provider: "lovable",
    });
  if (payload.stop_reason === "max_tokens") throw truncated();
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
    if (isAnthropic(model))
      return anthropicChat({
        apiKey,
        model,
        messages,
        maxOutputTokens,
        ...(temperature !== undefined ? { temperature } : {}),
        signal,
      });
    // Streamed, like the Claude path above, so a long answer never sits on one
    // silent connection until the gateway's edge gives up on it (524).
    const response = await openChat({
      apiKey,
      model,
      messages,
      json,
      maxOutputTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      signal,
    });
    if (!response.ok) throw await providerHttpError("lovable", response);
    if (response.body && /text\/event-stream/i.test(response.headers.get("content-type") ?? "")) {
      const streamed = await readChatStream(response.body);
      // A cut-off answer is a failure that hands over to the next model, never a partial plan.
      if (streamed.finishReason === "length") throw truncated();
      return { text: answerOrThrow(streamed.text), usage: streamed.usage };
    }
    // The gateway answered with one plain completion (it ignored `stream`).
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    if (payload.choices?.[0]?.finish_reason === "length") throw truncated();
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

/**
 * Text embeddings (POST /v1/embeddings). Returns the raw vectors in input
 * order, or null on any HTTP or shape problem; callers fail open.
 */
export async function lovableEmbeddings(apiKey: string, model: string, input: string[], options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<unknown[] | null> {
  const response = await (options.fetcher ?? fetch)(`${BASE}/embeddings`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: { embedding?: unknown; index?: number }[] };
  if (!Array.isArray(payload.data)) return null;
  return [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
}

export type VideoOutcome =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; kind: "model_unavailable" | "provider_error" | "timed_out" | "invalid_video"; detail: string; charged: boolean };


const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One Lovable AI video job (Gemini Omni body): create, poll, download. Never resubmits. */
export async function lovableVideo(
  apiKey: string,
  input: { model: string; prompt: string; seconds: number; size: string },
  waiting: { maxWaitMs: number; pollMs: number },
): Promise<VideoOutcome> {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const portrait = input.size === "720x1280";
    const seconds = Math.min(10, Math.max(3, Math.round(input.seconds)));
    const created = await fetch(`${BASE}/videos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        input: `${input.prompt} In a single continuous shot. No dialogue. No on-screen text.`,
        response_format: { type: "video", resolution: "720p", duration: `${seconds}s`, aspect_ratio: portrait ? "9:16" : "16:9" },
      }),
    });
    if (!created.ok) {
      const detail = `create answered ${created.status}`;
      return { ok: false, kind: created.status === 403 || created.status === 404 ? "model_unavailable" : "provider_error", detail, charged: false };
    }
    const job = (await created.json()) as { id?: string };
    if (!job.id) return { ok: false, kind: "provider_error", detail: "no job id returned", charged: false };
    const until = Date.now() + waiting.maxWaitMs;
    for (;;) {
      if (Date.now() >= until) return { ok: false, kind: "timed_out", detail: "job still rendering", charged: true };
      await pause(waiting.pollMs);
      const polled = await fetch(`${BASE}/videos/${encodeURIComponent(job.id)}`, { headers });
      if (!polled.ok) continue;
      const state = (await polled.json()) as { status?: string; error?: { message?: string } };
      if (state.status === "failed")
        return { ok: false, kind: "provider_error", detail: (state.error?.message ?? "job failed").slice(0, 160), charged: true };
      if (state.status !== "completed") continue;
      const content = await fetch(`${BASE}/videos/${encodeURIComponent(job.id)}/content`, { headers });
      if (!content.ok) return { ok: false, kind: "provider_error", detail: `download answered ${content.status}`, charged: true };
      const bytes = new Uint8Array(await content.arrayBuffer());
      if (bytes.byteLength === 0) return { ok: false, kind: "invalid_video", detail: "empty clip", charged: true };
      return { ok: true, bytes };
    }
}

/**
 * Text-to-speech on the Lovable gateway (/v1/audio/speech). Returns null when
 * no server key is configured. Spending is reserved by the caller
 * (lovable-speech.server.ts) before this is called. Redirects are refused.
 */
export async function postLovableSpeech(body: unknown, apiKey: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    ...(signal ? { signal } : {}),
  });
}
