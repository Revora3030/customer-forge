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
  builderExternalAiAllowed,
  providerChain,
  providerConfig,
  type ModelRole,
  type ProviderConfig,
  type ProviderName,
  zeroAiCostMode,
} from "@/lib/ai/config";
import { RevoraAiError, freeAiUnavailable, providerUnavailable } from "@/lib/ai/errors";
import {
  durableBudgetExhausted,
  durableProviderResting,
  noteDurableFreeUse,
  noteDurableProviderResult,
  refreshDurableRuntime,
} from "@/lib/ai/durable-health.server";
import {
  freeAiEnabled,
  freeAiOnly,
  freeBudgetAllows,
  freeBudgetCap,
  freeBudgetRemaining,
  freeProviderChain,
  freeProviderCredentials,
  freeProviderReadiness,
  imageEditCapableModel,
  isFreeEligibleModel,
  noteFreeUse,
  type FreeProviderName,
} from "@/lib/ai/free";
import { pickDiscoveredModels, refreshFreeModels } from "@/lib/ai/free-models.server";
import { cloudflareAdapter } from "@/lib/ai/providers/cloudflare";
import { googleAdapter } from "@/lib/ai/providers/google";
import { groqAdapter } from "@/lib/ai/providers/groq";
import { llm7Adapter } from "@/lib/ai/providers/llm7";
import { nvidiaAdapter } from "@/lib/ai/providers/nvidia";
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
  groq: groqAdapter,
  nvidia: nvidiaAdapter,
  llm7: llm7Adapter,
};

/* ----------------------------- circuit breaker ----------------------------- */

const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 60_000;
type BreakerState = { failures: number; openUntil: number };
type BreakerScope = {
  caller: Pick<AiCaller, "organizationId" | "userId" | "task">;
  provider: ProviderName;
  model: string;
};
const breaker = new Map<string, BreakerState>();

export function breakerScopeKey(scope: BreakerScope) {
  const tenant = scope.caller.organizationId ?? scope.caller.userId ?? "platform";
  return [tenant, scope.caller.task, scope.provider, scope.model].join("\u001f");
}

function providerHealthy(scope: BreakerScope) {
  const state = breaker.get(breakerScopeKey(scope));
  return !state || Date.now() >= state.openUntil;
}

function noteFailure(scope: BreakerScope) {
  const key = breakerScopeKey(scope);
  const state = breaker.get(key) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_FAILURES) {
    state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    state.failures = 0;
  }
  breaker.set(key, state);
}

function noteSuccess(scope: BreakerScope) {
  breaker.delete(breakerScopeKey(scope));
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
    const states = [...breaker.entries()]
      .filter(([key]) => key.split("\u001f")[2] === provider)
      .map(([, state]) => state);
    const cooldownUntil = states.reduce(
      (latest, state) => Math.max(latest, state.openUntil > Date.now() ? state.openUntil : 0),
      0,
    );
    return {
      provider,
      healthy: cooldownUntil === 0,
      failures: states.reduce((total, state) => total + state.failures, 0),
      cooldownUntil: cooldownUntil || null,
      isolatedScopes: states.length,
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
/**
 * How deep one provider's free pool may back a single role.
 *
 * There is NO fixed cap: the whole verified free catalogue of every configured
 * provider is usable. `FREE_AI_MODELS_PER_PROVIDER` exists only as an operator
 * safety valve (set a positive number to trim the failover depth); unset or 0
 * means "use the entire verified free pool".
 */
export function freeModelPoolDepth(): number {
  const raw = Number(process.env["FREE_AI_MODELS_PER_PROVIDER"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : Number.POSITIVE_INFINITY;
}

/**
 * Every verified free model available for one role, grouped by provider and in
 * preference order. This is the authoritative pool: no fixed per-provider cap.
 */
export async function freeModelPool(
  role: ModelRole,
  /**
   * Optional extra gate on top of free-eligibility, for a request that needs a
   * specific capability (editing an existing picture needs an image-to-image or
   * inpainting model, so a text-to-image model must never be dispatched).
   */
  capable?: (model: string) => boolean,
): Promise<{ provider: FreeProviderName; credentials: { apiKey: string; accountId?: string }; models: string[] }[]> {
  if (!freeAiEnabled()) return [];
  const depth = freeModelPoolDepth();
  const pools: {
    provider: FreeProviderName;
    credentials: { apiKey: string; accountId?: string };
    models: string[];
  }[] = [];
  await refreshDurableRuntime();
  for (const entry of freeProviderChain(role)) {
    // Pictures are metered separately from words: one generated picture costs
    // far more of the free daily allowance than one short answer.
    if (!freeBudgetAllows(entry.name, role)) continue;
    // Shared counters: skip a provider another worker has already exhausted.
    if (durableBudgetExhausted(entry.name, freeBudgetCap(entry.name))) continue;
    if (durableProviderResting(entry.name)) continue;
    const models: string[] = [];
    const consider = (model: string) => {
      // Belt and braces: never dispatch a model that isn't free-eligible.
      if (models.length >= depth) return;
      if (capable && !capable(model)) return;
      if (!models.includes(model) && isFreeEligibleModel(entry.name, model)) models.push(model);
    };
    try {
      // Image models come from a different catalogue endpoint, so the role is
      // passed through and the right pool is refreshed.
      await refreshFreeModels(entry.name, entry.credentials, role);
      // No truncation: the provider's whole verified free catalogue for this
      // role is ranked and offered.
      for (const model of pickDiscoveredModels(entry.name, role, depth)) consider(model);
    } catch {
      // Discovery is advisory only; the configured free model still runs.
    }
    consider(entry.model);
    if (models.length) pools.push({ provider: entry.name, credentials: entry.credentials, models });
  }
  return pools;
}

async function buildChain(
  caller: AiCaller,
  role: ModelRole,
  capable?: (model: string) => boolean,
): Promise<Candidate[]> {
  // Native-only is the production default. This guard sits before free-model
  // discovery as well as paid providers, so no customer content or attachment
  // can leave Revora merely because a provider happens to have a free tier.
  // External calls are reserved for explicit operator diagnostics and require
  // both switches to be deliberately opened on the server.
  if (zeroAiCostMode() || !builderExternalAiAllowed()) return [];

  // First choice per provider (breadth), then each provider's remaining free
  // models (depth). Breadth first means a provider outage costs one attempt,
  // while depth means a single retired or rate-limited model is covered by
  // another model from the same free catalogue.
  const first: Candidate[] = [];
  const deeper: Candidate[] = [];

  for (const pool of await freeModelPool(role, capable))
    pool.models.forEach((model, index) => {
      const candidate = freeCandidate(pool.provider, pool.credentials.apiKey, model, role);
      if (index === 0) first.push(candidate);
      else deeper.push(candidate);
    });

  const candidates = [...first, ...deeper];

  // Paid providers stay unreachable unless BOTH guards are explicitly off.
  if (!freeAiOnly())
    for (const config of providerChain()) {
      const model = config.models[role];
      if (capable && !capable(model)) continue;
      candidates.push({ config, model, free: null });
    }

  const ordered = [
    ...candidates.filter((entry) =>
      providerHealthy({ caller, provider: entry.config.name, model: entry.model }),
    ),
    ...candidates.filter(
      (entry) => !providerHealthy({ caller, provider: entry.config.name, model: entry.model }),
    ),
  ];
  // The POOL is unlimited; one single request's FAILOVER depth is not, so a
  // simple call can never turn into a 60-model latency wall. The ensemble
  // orchestrator uses the full pool in parallel instead.
  const failoverLimit = Number(process.env["AI_MAX_FAILOVER_CANDIDATES"] ?? "");
  const cap = Number.isFinite(failoverLimit) && failoverLimit > 0 ? Math.floor(failoverLimit) : 8;
  return ordered.slice(0, cap);
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
    paidFallbackReachable:
      builderExternalAiAllowed() && !freeAiOnly() && !zeroAiCostMode(),
    /** The most recent model call: who served it and how it ended. */
    last: lastAiOutcome(),
    providers: freeProviderReadiness().map((entry) => {
      const states = [...breaker.entries()]
        .filter(([key]) => key.split("\u001f")[2] === entry.name)
        .map(([, state]) => state);
      const cooldownUntil = states.reduce(
        (latest, state) => Math.max(latest, state.openUntil > Date.now() ? state.openUntil : 0),
        0,
      );
      return {
        ...entry,
        healthy: cooldownUntil === 0,
        openFailures: states.reduce((total, state) => total + state.failures, 0),
        cooldownUntil: cooldownUntil || null,
        isolatedScopes: states.length,
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
  options?: { capable?: (model: string) => boolean; nextProviderOnInvalidRequest?: boolean },
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
  const chain = await buildChain(caller, role, options?.capable);
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
      const breakerScope = { caller, provider: config.name, model };
      const fallbackUsed = index > 0;

      for (let attempt = 1; attempt <= limits.maxAttemptsPerProvider; attempt += 1) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), limits.requestTimeoutMs);
        try {
          if (candidate.free) {
            noteFreeUse(candidate.free, role);
            void noteDurableFreeUse(candidate.free, freeBudgetCap(candidate.free));
          }
          const result = await execute({ adapter, config, model, signal: controller.signal });
          noteSuccess(breakerScope);
          if (candidate.free)
            void noteDurableProviderResult({
              provider: candidate.free,
              ok: true,
              latencyMs: Date.now() - started,
            });
          lastOutcome = {
            at: Date.now(),
            provider: config.name,
            model,
            task: caller.task,
            ok: true,
            category: null,
            fallbackUsed,
            free: candidate.free !== null,
          };

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
          if (error.retryable) noteFailure(breakerScope);
          if (candidate.free)
            void noteDurableProviderResult({
              provider: candidate.free,
              ok: false,
              latencyMs: Date.now() - started,
              rateLimited: error.category === "rate_limited",
            });
          lastOutcome = {
            at: Date.now(),
            provider: config.name,
            model,
            task: caller.task,
            ok: false,
            category: error.category,
            fallbackUsed,
            free: candidate.free !== null,
          };

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

          // A bad request or a rejected key is normally the same on every attempt
          // and every provider key of the same kind: stop instead of burning
          // calls. The exception is a request carrying an attachment: providers
          // differ in what they accept, so one refusing a picture says nothing
          // about the next free provider. Move on instead of giving up.
          if (error.category === "invalid_request" && options?.nextProviderOnInvalidRequest) break;
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

/** True when any message carries a picture, video or recording. */
function carriesAttachment(messages: AiRequest["messages"]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type !== "text"),
  );
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
    { nextProviderOnInvalidRequest: carriesAttachment(request.messages) },
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
  guardRequest(request.messages);
  const limits = aiLimits();
  // The shape check runs INSIDE the provider loop, so a model that answers with
  // something unparseable is treated as that provider failing: the next free
  // provider is tried, and only when none can answer does the caller fall back
  // to Revora's deterministic engine.
  const outcome = await run(
    caller,
    request.role ?? "primary",
    async ({ adapter, config, model, signal }) => {
      const result = await adapter.chat({
        apiKey: config.apiKey,
        model,
        messages: request.messages,
        json: true,
        maxOutputTokens: Math.min(
          request.maxOutputTokens ?? limits.maxOutputTokens,
          limits.maxOutputTokens,
        ),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        signal,
      });
      return {
        value: { text: result.text, data: parseJsonObject(result.text) },
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      };
    },
    { nextProviderOnInvalidRequest: carriesAttachment(request.messages) },
  );
  return {
    text: outcome.value.text,
    data: outcome.value.data,
    provider: outcome.provider,
    model: outcome.model,
    usage: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
    fallbackUsed: outcome.fallbackUsed,
    requestId: outcome.requestId,
  };
}

/** Parses a model's JSON answer, tolerating a fenced code block. */
function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    return parsed as Record<string, unknown>;
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

const PAID_IMAGE_FALLBACK_MODEL = "gpt-image-2";

function paidImageEstimateMicrocents() {
  const raw = Number(process.env["PAID_IMAGE_ESTIMATE_MICROCENTS"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 10_000_000;
}

export function paidImageFallbackStatus(): {
  available: boolean;
  provider: ProviderName | null;
  model: string | null;
  reason: string | null;
  message: string;
} {
  if (zeroAiCostMode())
    return {
      available: false,
      provider: null,
      model: null,
      reason: "ZERO_AI_COST_MODE",
      message: "Paid starter pictures are off because zero-cost mode is enabled.",
    };
  if (!builderExternalAiAllowed())
    return {
      available: false,
      provider: null,
      model: null,
      reason: "BUILDER_EXTERNAL_AI_ALLOWED",
      message: "Paid starter pictures are off until builder external AI is explicitly enabled.",
    };
  if (freeAiOnly())
    return {
      available: false,
      provider: null,
      model: null,
      reason: "FREE_AI_ONLY",
      message: "Paid starter pictures are blocked by free-only mode.",
    };
  const config = providerConfig("openai");
  if (!config)
    return {
      available: false,
      provider: null,
      model: PAID_IMAGE_FALLBACK_MODEL,
      reason: "OPENAI_API_KEY",
      message: "Paid starter pictures need the OPENAI_API_KEY server credential.",
    };
  const model = config.models.image;
  if (model !== PAID_IMAGE_FALLBACK_MODEL)
    return {
      available: false,
      provider: "openai",
      model,
      reason: "AI_OPENAI_MODEL_IMAGE",
      message: `Paid starter pictures are configured for ${model}; Revora will only use ${PAID_IMAGE_FALLBACK_MODEL} for this fallback.`,
    };
  return {
    available: true,
    provider: "openai",
    model,
    reason: null,
    message: "Paid starter picture fallback is enabled and budget-gated.",
  };
}

/** Explicit paid fallback for first-build starter pictures. Never used by default. */
export async function generatePaidImageFallback(
  caller: AiCaller,
  prompt: string,
): Promise<AiImageResult> {
  const status = paidImageFallbackStatus();
  if (!status.available) {
    const category = status.reason === "OPENAI_API_KEY" ? "not_configured" : "zero_cost_mode";
    throw new RevoraAiError(503, status.message, { category, provider: status.provider });
  }
  const config = providerConfig("openai");
  if (!config) {
    throw new RevoraAiError(503, "Paid starter pictures need the OPENAI_API_KEY server credential.", {
      category: "not_configured",
      provider: "openai",
    });
  }
  const limits = aiLimits();
  if (prompt.length > limits.maxRequestChars)
    throw new RevoraAiError(413, "That image brief is too long for Revora AI.", {
      category: "too_large",
      provider: "openai",
    });

  const { reserveBudget, settleBudget, recordUsage } = await import("@/lib/ai/luna.server");
  const estimate = paidImageEstimateMicrocents();
  const organizationId = caller.organizationId ?? null;
  const reservation = await reserveBudget(estimate, organizationId);
  if (!reservation)
    throw new RevoraAiError(503, "Paid starter pictures are paused because the spend ledger is unavailable.", {
      category: "provider_unavailable",
      provider: "openai",
    });
  if (!reservation.allowed) {
    await recordUsage({
      organizationId,
      purpose: "image_generation",
      model: PAID_IMAGE_FALLBACK_MODEL,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "skipped",
      reason: "monthly cap reached",
    });
    throw new RevoraAiError(402, "Paid starter pictures are paused because the monthly AI cap is reached.", {
      category: "quota",
      provider: "openai",
    });
  }

  const requestId = caller.requestId ?? newRequestId();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.requestTimeoutMs);
  try {
    const result = await openAiAdapter.image({
      apiKey: config.apiKey,
      model: PAID_IMAGE_FALLBACK_MODEL,
      prompt,
      source: null,
      signal: controller.signal,
    });
    await settleBudget(organizationId, estimate, estimate);
    await recordUsage({
      organizationId,
      purpose: "image_generation",
      model: PAID_IMAGE_FALLBACK_MODEL,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: estimate,
      outcome: "succeeded",
      reason: null,
    });
    lastOutcome = {
      at: Date.now(),
      provider: "openai",
      model: PAID_IMAGE_FALLBACK_MODEL,
      task: caller.task,
      ok: true,
      category: null,
      fallbackUsed: true,
      free: false,
    };
    void recordAiEvent({
      requestId,
      provider: "openai",
      model: PAID_IMAGE_FALLBACK_MODEL,
      task: caller.task,
      organizationId,
      userId: caller.userId ?? null,
      latencyMs: Date.now() - started,
      ok: true,
      errorCategory: null,
      inputTokens: null,
      outputTokens: null,
      fallbackUsed: true,
      toolCalls: 0,
    });
    return { ...result, provider: "openai", model: PAID_IMAGE_FALLBACK_MODEL, fallbackUsed: true, requestId };
  } catch (rawError) {
    await settleBudget(organizationId, estimate, 0);
    const error =
      rawError instanceof RevoraAiError
        ? rawError
        : controller.signal.aborted
          ? new RevoraAiError(408, "Revora AI took too long to make that picture.", {
              category: "timeout",
              provider: "openai",
            })
          : providerUnavailable("openai", (rawError as Error)?.message?.slice(0, 120));
    await recordUsage({
      organizationId,
      purpose: "image_generation",
      model: PAID_IMAGE_FALLBACK_MODEL,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "failed",
      reason: error.category,
    });
    lastOutcome = {
      at: Date.now(),
      provider: "openai",
      model: PAID_IMAGE_FALLBACK_MODEL,
      task: caller.task,
      ok: false,
      category: error.category,
      fallbackUsed: true,
      free: false,
    };
    void recordAiEvent({
      requestId,
      provider: "openai",
      model: PAID_IMAGE_FALLBACK_MODEL,
      task: caller.task,
      organizationId,
      userId: caller.userId ?? null,
      latencyMs: Date.now() - started,
      ok: false,
      errorCategory: error.category,
      inputTokens: null,
      outputTokens: null,
      fallbackUsed: true,
      toolCalls: 0,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
  const outcome = await run(
    caller,
    "image",
    async ({ adapter, config, model, signal }) => {
      const result = await adapter.image({
        apiKey: config.apiKey,
        model,
        prompt,
        source,
        signal,
      });
      return { value: result };
    },
    // Changing an existing picture needs an image-to-image / inpainting model.
    // A text-to-image model would ignore the source and hand back an unrelated
    // picture, so it is kept out of the chain entirely.
    source ? { capable: imageEditCapableModel } : undefined,
  );
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

/* ---------------------- pinned free-model calls (ensemble) ------------------ */

/**
 * One call against ONE named free model.
 *
 * The ensemble orchestrator needs to run many specific models side by side
 * rather than take the first that answers, so this is the router's pinned
 * entry point. It stays inside the router on purpose: the free-eligibility
 * gate, the daily budget, the circuit breaker, the request guard, the timeout
 * and the telemetry are all the same ones the failover chain uses, so no
 * caller can reach a provider directly and no paid model can be pinned.
 */
export type PinnedFreeCall = {
  provider: FreeProviderName;
  model: string;
  role: ModelRole;
  messages: AiMessage[];
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  /** Overrides the router timeout for one call; never raises it above the limit. */
  timeoutMs?: number;
};

export type PinnedFreeResult = {
  provider: FreeProviderName;
  model: string;
  text: string;
  data: Record<string, unknown> | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function callPinnedFreeModel(
  caller: AiCaller,
  call: PinnedFreeCall,
): Promise<PinnedFreeResult> {
  if (!freeAiEnabled()) throw freeAiUnavailable("free AI is disabled");
  // ZERO-COST INVARIANT: a pinned id must be free-eligible for that provider.
  if (!isFreeEligibleModel(call.provider, call.model))
    throw new RevoraAiError(403, "That model is not verified free, so Revora will not call it.", {
      category: "invalid_request",
      provider: call.provider,
    });
  if (!freeBudgetAllows(call.provider))
    throw new RevoraAiError(429, "That free provider is out of budget for today.", {
      category: "rate_limited",
      provider: call.provider,
    });
  const breakerScope = {
    caller,
    provider: call.provider as ProviderName,
    model: call.model,
  };
  if (!providerHealthy(breakerScope))
    throw providerUnavailable(call.provider, "cooling down after repeated failures");
  // SHARED STATE: many workers spend one free allowance, so the cross-worker
  // counters get a say too. They may only ever add caution, never remove it,
  // and an unreachable store simply leaves the local gates in charge.
  const cap = freeBudgetCap(call.provider);
  await refreshDurableRuntime();
  if (durableBudgetExhausted(call.provider, cap))
    throw new RevoraAiError(429, "That free provider is out of budget for today.", {
      category: "rate_limited",
      provider: call.provider,
    });
  if (durableProviderResting(call.provider))
    throw providerUnavailable(call.provider, "cooling down after repeated failures");
  const credentials = freeProviderCredentials(call.provider);
  if (!credentials) throw freeAiUnavailable(`${call.provider} has no credentials configured`);

  guardRequest(call.messages);
  const limits = aiLimits();
  const adapter = ADAPTERS[call.provider as ProviderName];
  const controller = new AbortController();
  const timeout = Math.min(call.timeoutMs ?? limits.requestTimeoutMs, limits.requestTimeoutMs);
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();
  const requestId = caller.requestId ?? newRequestId();
  const concurrencyKey = caller.organizationId ?? caller.userId ?? "platform";
  if (!acquire(concurrencyKey, limits.maxConcurrentPerWorkspace)) {
    clearTimeout(timer);
    throw new RevoraAiError(429, "Revora AI is already working on this workspace's requests.", {
      category: "rate_limited",
    });
  }
  try {
    noteFreeUse(call.provider);
    void noteDurableFreeUse(call.provider, cap);
    const result = await adapter.chat({
      apiKey: credentials.apiKey,
      model: call.model,
      messages: call.messages,
      json: call.json === true,
      maxOutputTokens: Math.min(
        call.maxOutputTokens ?? limits.maxOutputTokens,
        limits.maxOutputTokens,
      ),
      ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
      signal: controller.signal,
    });
    noteSuccess(breakerScope);
    const latencyMs = Date.now() - started;
    void noteDurableProviderResult({ provider: call.provider, ok: true, latencyMs });
    void recordAiEvent({
      requestId,
      provider: call.provider as ProviderName,
      model: call.model,
      task: caller.task,
      organizationId: caller.organizationId ?? null,
      userId: caller.userId ?? null,
      latencyMs,
      ok: true,
      errorCategory: null,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      fallbackUsed: false,
      toolCalls: 0,
    });
    return {
      provider: call.provider,
      model: call.model,
      text: result.text,
      // A malformed answer is the model's failure, not a crash: the ensemble
      // scores it out instead of the whole build stopping.
      data: call.json === true ? safeJsonObject(result.text) : null,
      latencyMs,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  } catch (rawError) {
    const error =
      rawError instanceof RevoraAiError
        ? rawError
        : controller.signal.aborted
          ? new RevoraAiError(408, "Revora AI took too long to answer.", {
              category: "timeout",
              provider: call.provider,
            })
          : providerUnavailable(call.provider, (rawError as Error)?.message?.slice(0, 120));
    if (error.retryable) noteFailure(breakerScope);
    void noteDurableProviderResult({
      provider: call.provider,
      ok: false,
      latencyMs: Date.now() - started,
      rateLimited: error.category === "rate_limited",
    });
    void recordAiEvent({
      requestId,
      provider: call.provider as ProviderName,
      model: call.model,
      task: caller.task,
      organizationId: caller.organizationId ?? null,
      userId: caller.userId ?? null,
      latencyMs: Date.now() - started,
      ok: false,
      errorCategory: error.category,
      inputTokens: null,
      outputTokens: null,
      fallbackUsed: false,
      toolCalls: 0,
    });
    throw error;
  } finally {
    clearTimeout(timer);
    release(concurrencyKey);
  }
}

/** JSON parse that reports failure as null instead of throwing. */
function safeJsonObject(text: string): Record<string, unknown> | null {
  try {
    return parseJsonObject(text);
  } catch {
    return null;
  }
}
