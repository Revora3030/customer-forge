/**
 * The Revora AI orchestrator: the only place in Revora that talks to an AI
 * provider.
 *
 *   caller → orchestrator → model router → provider adapter → AI provider
 *
 * Everything the rest of the platform needs is exported here as a task-shaped
 * function (`generateText`, `generateStructuredOutput`, `analyzeImage`, …).
 * Callers never see a provider name, a model name, a URL or a key, so changing
 * provider is configuration plus one adapter.
 *
 * Guarantees enforced here, in one place:
 * - Fail closed: with no Revora-owned provider key configured, every call
 *   throws the single "Revora AI is not configured" error. There is no hidden
 *   fallback to any hosted gateway.
 * - Bounded work: request size, output tokens, attachment size, timeout,
 *   attempts and workspace concurrency all come from `aiLimits()`.
 * - Only retryable failures are retried, with backoff and a hard attempt cap.
 * - A provider that keeps failing is taken out of rotation for a cooldown
 *   (circuit breaker) so a dead provider can't slow every request.
 * - Every attempt is recorded as telemetry, successes and failures alike.
 *
 * Server-only.
 */

import {
  aiLimits,
  providerChain,
  type ModelRole,
  type ProviderConfig,
  type ProviderName,
  zeroAiCostMode,
} from "@/lib/ai/config";
import { RevoraAiError, freeAiUnavailable, providerUnavailable } from "@/lib/ai/errors";
import {
  freeAiEnabled,
  freeAiOnly,
  freeBudgetAllows,
  freeBudgetRemaining,
  freeProviderChain,
  freeProviderReadiness,
  isFreeEligibleModel,
  noteFreeUse,
  type FreeProviderName,
} from "@/lib/ai/free";
import { pickDiscoveredModel, refreshFreeModels } from "@/lib/ai/free-models.server";
import { cloudflareAdapter } from "@/lib/ai/providers/cloudflare";
import { googleAdapter } from "@/lib/ai/providers/google";
import { openRouterAdapter } from "@/lib/ai/providers/openrouter";
import { openAiAdapter } from "@/lib/ai/providers/openai";
import { base64ByteLength } from "@/lib/ai/providers/shared";
import { checkAiLimits, recordAiEvent } from "@/lib/ai/telemetry.server";
import type {
  AiCaller,
  AiImageResult,
  AiJsonResult,
  AiMessage,
  AiPart,
  AiRequest,
  AiTextResult,
  AiTranscriptResult,
  ProviderAdapter,
} from "@/lib/ai/types";

const ADAPTERS: Record<ProviderName, ProviderAdapter> = {
  google: googleAdapter,
  openai: openAiAdapter,
  cloudflare: cloudflareAdapter,
  openrouter: openRouterAdapter,
};

/* ----------------------------- circuit breaker ----------------------------- */

const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const breaker = new Map<ProviderName, { failures: number; openUntil: number }>();

function providerHealthy(provider: ProviderName) {
  const state = breaker.get(provider);
  return !state || Date.now() >= state.openUntil;
}

function noteFailure(provider: ProviderName) {
  const state = breaker.get(provider) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_FAILURES) {
    state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    state.failures = 0;
  }
  breaker.set(provider, state);
}

function noteSuccess(provider: ProviderName) {
  breaker.delete(provider);
}

/* --------------------------- last-request visibility ----------------------- */

/**
 * What happened on the most recent model call, for the admin surface. Provider,
 * model, task, whether a backup covered it and the failure category only —
 * never a prompt, never any part of a credential.
 */
export type LastAiOutcome = {
  at: number;
  provider: ProviderName;
  model: string;
  task: string;
  ok: boolean;
  category: string | null;
  fallbackUsed: boolean;
  free: boolean;
};

let lastOutcome: LastAiOutcome | null = null;

export function lastAiOutcome(): LastAiOutcome | null {
  return lastOutcome;
}

/** Test/operations helper: forgets breaker state and the last outcome. */
export function resetAiRuntimeStatus() {
  lastOutcome = null;
  breaker.clear();
}

/** Provider health as the admin dashboard reports it — measured, not guessed. */
export function providerHealth() {
  return Object.keys(ADAPTERS).map((name) => {
    const provider = name as ProviderName;
    const state = breaker.get(provider);
    return {
      provider,
      healthy: providerHealthy(provider),
      failures: state?.failures ?? 0,
      cooldownUntil: state && state.openUntil > Date.now() ? state.openUntil : null,
    };
  });
}


/* ------------------------------ the free chain ----------------------------- */

type Candidate = { config: ProviderConfig; model: string; free: FreeProviderName | null };

function freeCandidate(
  name: FreeProviderName,
  apiKey: string,
  model: string,
  role: ModelRole,
): Candidate {
  const models = {
    primary: model,
    fast: model,
    vision: model,
    coding: model,
    image: model,
    transcription: model,
  } as Record<ModelRole, string>;
  models[role] = model;
  return { config: { name: name as ProviderName, apiKey, models }, model, free: name };
}

/**
 * The provider order for one request:
 *
 * 1. every configured FREE provider that has a free-eligible model for the
 *    role, still inside its daily budget, healthiest first;
 * 2. a paid provider ONLY when an operator has explicitly turned off both
 *    free-only mode and zero-cost mode. There is no implicit paid fallback.
 *
 * Live discovery is consulted first so a provider's current free pool is used
 * instead of a fixed list; a discovered id must still pass the free-eligibility
 * check before it can replace the configured model.
 */
async function buildChain(role: ModelRole): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  if (freeAiEnabled())
    for (const entry of freeProviderChain(role)) {
    if (!freeBudgetAllows(entry.name)) continue;
    let model = entry.model;
    try {
      await refreshFreeModels(entry.name, entry.credentials);
      const discovered = pickDiscoveredModel(entry.name, role);
      if (discovered && isFreeEligibleModel(entry.name, discovered)) model = discovered;
    } catch {
      // Discovery is advisory only; the configured free model still runs.
    }
    // Belt and braces: never dispatch a model that isn't free-eligible.
    if (!isFreeEligibleModel(entry.name, model)) continue;
    candidates.push(freeCandidate(entry.name, entry.credentials.apiKey, model, role));
  }

  // Paid providers stay unreachable unless BOTH guards are explicitly off.
  if (!freeAiOnly() && !zeroAiCostMode())
    for (const config of providerChain())
      candidates.push({ config, model: config.models[role], free: null });

  return [
    ...candidates.filter((entry) => providerHealthy(entry.config.name)),
    ...candidates.filter((entry) => !providerHealthy(entry.config.name)),
  ];
}

/**
 * Free AI status for the admin surface. Reports what is configured, what the
 * provider publishes as its free allowance, what budget is left in this
 * process, and which providers are in a breaker cooldown. No key material and
 * no secret-derived value is included.
 */
export function freeAiStatus() {
  return {
    freeAiEnabled: freeAiEnabled(),
    freeOnly: freeAiOnly(),
    paidFallbackReachable: !freeAiOnly() && !zeroAiCostMode(),
    providers: freeProviderReadiness().map((entry) => {
      const state = breaker.get(entry.name as ProviderName);
      const cooling = state && state.openUntil > Date.now();
      return {
        ...entry,
        healthy: !cooling,
        cooldownUntil: cooling ? state.openUntil : null,
        remainingToday: freeBudgetRemaining(entry.name),
      };
    }),
  };
}

/* ------------------------------- concurrency ------------------------------- */

const inFlight = new Map<string, number>();

function acquire(key: string, max: number) {
  const current = inFlight.get(key) ?? 0;
  if (current >= max) return false;
  inFlight.set(key, current + 1);
  return true;
}

function release(key: string) {
  const current = inFlight.get(key) ?? 0;
  if (current <= 1) inFlight.delete(key);
  else inFlight.set(key, current - 1);
}

/* --------------------------------- helpers -------------------------------- */

function newRequestId() {
  return `rai_${crypto.randomUUID()}`;
}

function messageChars(messages: AiMessage[]) {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === "string") total += message.content.length;
    else for (const part of message.content) total += part.type === "text" ? part.text.length : 0;
  }
  return total;
}

function attachmentParts(messages: AiMessage[]): AiPart[] {
  const parts: AiPart[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) if (part.type !== "text") parts.push(part);
  }
  return parts;
}

/** Rejects oversized requests before a provider is paid to reject them. */
function guardRequest(messages: AiMessage[]) {
  const limits = aiLimits();
  if (messageChars(messages) > limits.maxRequestChars)
    throw new RevoraAiError(413, "That request is too long for Revora AI. Shorten it and retry.", {
      category: "too_large",
    });
  for (const part of attachmentParts(messages)) {
    const dataUrl = "dataUrl" in part ? part.dataUrl : "";
    if (base64ByteLength(dataUrl) > limits.maxAttachmentBytes)
      throw new RevoraAiError(413, "That attachment is too large for Revora AI.", {
        category: "too_large",
      });
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one logical AI call: model routing, provider order, retries on
 * retryable failures only, fallback to the next configured provider, telemetry
 * for every attempt. Never falls back to anything Revora doesn't own.
 */
async function run<T>(
  caller: AiCaller,
  role: ModelRole,
  execute: (input: {
    adapter: ProviderAdapter;
    config: ProviderConfig;
    model: string;
    signal: AbortSignal;
  }) => Promise<{ value: T; inputTokens?: number | null; outputTokens?: number | null }>,
): Promise<{
  value: T;
  provider: ProviderName;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const limits = aiLimits();
  const requestId = caller.requestId ?? newRequestId();

  // FREE-FIRST GATE. Free providers are tried first; paid providers are only in
  // this chain when an operator has explicitly opted out of free-only and
  // zero-cost mode. An empty chain is not a crash: the caller falls back to
  // Revora's deterministic engine and the owner gets a precise explanation.
  const chain = await buildChain(role);
  if (chain.length === 0) throw freeAiUnavailable("no free provider configured or in budget");

  const verdict = await checkAiLimits(caller);
  if (!verdict.allowed) throw new RevoraAiError(429, verdict.reason, { category: "rate_limited" });

  const concurrencyKey = caller.organizationId ?? caller.userId ?? "platform";
  if (!acquire(concurrencyKey, limits.maxConcurrentPerWorkspace))
    throw new RevoraAiError(429, "Revora AI is already working on this workspace's requests.", {
      category: "rate_limited",
    });

  try {
    const ordered = chain;
    let lastError: unknown = null;

    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index]!;
      const config = candidate.config;
      const adapter = ADAPTERS[config.name];
      const model = candidate.model;
      const fallbackUsed = index > 0;

      for (let attempt = 1; attempt <= limits.maxAttemptsPerProvider; attempt += 1) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), limits.requestTimeoutMs);
        try {
          if (candidate.free) noteFreeUse(candidate.free);
          const result = await execute({ adapter, config, model, signal: controller.signal });
          noteSuccess(config.name);
          void recordAiEvent({
            requestId,
            provider: config.name,
            model,
            task: caller.task,
            organizationId: caller.organizationId ?? null,
            userId: caller.userId ?? null,
            latencyMs: Date.now() - started,
            ok: true,
            errorCategory: null,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            fallbackUsed,
            toolCalls: 0,
          });
          return {
            value: result.value,
            provider: config.name,
            model,
            fallbackUsed,
            requestId,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
          };
        } catch (rawError) {
          const error =
            rawError instanceof RevoraAiError
              ? rawError
              : controller.signal.aborted
                ? new RevoraAiError(408, "Revora AI took too long to answer. Try again.", {
                    category: "timeout",
                    provider: config.name,
                  })
                : providerUnavailable(config.name, (rawError as Error)?.message?.slice(0, 120));
          lastError = error;
          noteFailure(config.name);
          void recordAiEvent({
            requestId,
            provider: config.name,
            model,
            task: caller.task,
            organizationId: caller.organizationId ?? null,
            userId: caller.userId ?? null,
            latencyMs: Date.now() - started,
            ok: false,
            errorCategory: error.category,
            inputTokens: null,
            outputTokens: null,
            fallbackUsed,
            toolCalls: 0,
          });

          // A bad request or a rejected key is the same on every attempt and on
          // every provider key of the same kind: stop instead of burning calls.
          if (error.category === "invalid_request" || error.category === "too_large") throw error;
          if (!error.retryable) break;
          if (attempt < limits.maxAttemptsPerProvider) {
            const backoff = error.retryAfterSeconds
              ? Math.min(error.retryAfterSeconds * 1000, 10_000)
              : 400 * attempt ** 2 + Math.floor(Math.random() * 250);
            await wait(backoff);
          }
        } finally {
          clearTimeout(timer);
        }
      }
    }

    throw lastError instanceof RevoraAiError
      ? lastError
      : providerUnavailable(ordered[0]?.config.name ?? "cloudflare");
  } finally {
    release(concurrencyKey);
  }
}

/* ------------------------------ public surface ----------------------------- */

/** Plain text generation. */
export async function generateText(caller: AiCaller, request: AiRequest): Promise<AiTextResult> {
  guardRequest(request.messages);
  const limits = aiLimits();
  const outcome = await run(
    caller,
    request.role ?? "primary",
    async ({ adapter, config, model, signal }) => {
      const result = await adapter.chat({
        apiKey: config.apiKey,
        model,
        messages: request.messages,
        json: request.json === true,
        maxOutputTokens: Math.min(
          request.maxOutputTokens ?? limits.maxOutputTokens,
          limits.maxOutputTokens,
        ),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        signal,
      });
      return {
        value: result.text,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      };
    },
  );
  return {
    text: outcome.value,
    provider: outcome.provider,
    model: outcome.model,
    usage: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
    fallbackUsed: outcome.fallbackUsed,
    requestId: outcome.requestId,
  };
}

/** JSON object generation, with fenced-code repair and a shape check. */
export async function generateStructuredOutput(
  caller: AiCaller,
  request: AiRequest,
): Promise<AiJsonResult> {
  const result = await generateText(caller, { ...request, json: true });
  const cleaned = result.text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    return { ...result, data: parsed as Record<string, unknown> };
  } catch {
    throw new RevoraAiError(502, "Revora AI returned an unexpected response. Try rewording.", {
      category: "bad_response",
    });
  }
}

/** Code and structured reasoning work; routes to the coding model. */
export async function generateCode(caller: AiCaller, request: AiRequest) {
  return generateText(caller, { ...request, role: request.role ?? "coding" });
}

/** Image understanding; routes to the vision model. */
export async function analyzeImage(caller: AiCaller, request: AiRequest) {
  return generateText(caller, { ...request, role: request.role ?? "vision" });
}

/** Video understanding; routes to the vision model. */
export async function analyzeVideo(caller: AiCaller, request: AiRequest) {
  return generateText(caller, { ...request, role: request.role ?? "vision" });
}

/** Voice to text. */
export async function transcribeAudio(
  caller: AiCaller,
  audio: { dataUrl: string; mimeType: string; name?: string },
): Promise<AiTranscriptResult> {
  const limits = aiLimits();
  if (base64ByteLength(audio.dataUrl) > limits.maxAttachmentBytes)
    throw new RevoraAiError(413, "That recording is too long for Revora AI.", {
      category: "too_large",
    });
  const outcome = await run(caller, "transcription", async ({ adapter, config, model, signal }) => {
    const result = await adapter.transcribe({
      apiKey: config.apiKey,
      model,
      audio: { dataUrl: audio.dataUrl, mimeType: audio.mimeType, name: audio.name ?? "voice" },
      signal,
    });
    return { value: result.text };
  });
  return {
    text: outcome.value,
    provider: outcome.provider,
    model: outcome.model,
    fallbackUsed: outcome.fallbackUsed,
    requestId: outcome.requestId,
  };
}

/** New image from a prompt. */
export async function generateImage(caller: AiCaller, prompt: string): Promise<AiImageResult> {
  return imageCall(caller, prompt, null);
}

/** Edit an existing image with a prompt. */
export async function editImage(
  caller: AiCaller,
  prompt: string,
  source: { dataUrl: string; mimeType: string },
): Promise<AiImageResult> {
  return imageCall(caller, prompt, source);
}

async function imageCall(
  caller: AiCaller,
  prompt: string,
  source: { dataUrl: string; mimeType: string } | null,
): Promise<AiImageResult> {
  const limits = aiLimits();
  if (prompt.length > limits.maxRequestChars)
    throw new RevoraAiError(413, "That image brief is too long for Revora AI.", {
      category: "too_large",
    });
  if (source && base64ByteLength(source.dataUrl) > limits.maxAttachmentBytes)
    throw new RevoraAiError(413, "That image is too large for Revora AI.", {
      category: "too_large",
    });
  const outcome = await run(caller, "image", async ({ adapter, config, model, signal }) => {
    const result = await adapter.image({
      apiKey: config.apiKey,
      model,
      prompt,
      source,
      signal,
    });
    return { value: result };
  });
  return {
    base64: outcome.value.base64,
    mimeType: outcome.value.mimeType,
    provider: outcome.provider,
    model: outcome.model,
    fallbackUsed: outcome.fallbackUsed,
    requestId: outcome.requestId,
  };
}

/**
 * Streaming text. Returns the provider's raw event stream plus the provider and
 * model that served it, so a route can pass tokens straight to the browser
 * without buffering the whole answer.
 */
export async function streamResponse(
  caller: AiCaller,
  request: AiRequest,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  provider: ProviderName;
  model: string;
  requestId: string;
}> {
  guardRequest(request.messages);
  const limits = aiLimits();
  const outcome = await run(
    caller,
    request.role ?? "primary",
    async ({ adapter, config, model, signal }) => {
      const stream = await adapter.stream({
        apiKey: config.apiKey,
        model,
        messages: request.messages,
        maxOutputTokens: Math.min(
          request.maxOutputTokens ?? limits.maxOutputTokens,
          limits.maxOutputTokens,
        ),
        signal,
      });
      return { value: stream };
    },
  );
  return {
    stream: outcome.value,
    provider: outcome.provider,
    model: outcome.model,
    requestId: outcome.requestId,
  };
}
