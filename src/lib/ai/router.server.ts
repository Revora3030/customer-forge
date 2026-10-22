import { scopedPreferredModels } from "./model-preference-scope.server";
import { reportModelAnswered } from "./model-activity-scope.server";
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
 * - Fail closed: with no provider key configured, every call throws the
 *   single "Revora AI is not configured" error. Lovable's AI Gateway is a
 *   keyed paid provider here, not a hidden fallback: it is reachable only
 *   when LOVABLE_API_KEY is present, outside free-only scopes, and under the
 *   same daily paid cap as every other paid provider.
 * - Bounded work: request size, output tokens, attachment size, timeout,
 *   attempts and workspace concurrency all come from `aiLimits()`.
 * - Only retryable failures are retried, with backoff and a hard attempt cap.
 * - A provider that keeps failing is taken out of rotation for a cooldown
 *   (circuit breaker) so a dead provider can't slow every request.
 * - Every attempt is recorded as telemetry, successes and failures alike.
 *
 * Server-only.
 */

import { reservePaidSpend, routerActual, routerEstimate, settlePaidSpend, type PaidReservation } from "@/lib/ai/paid-budget.server";
import { scopedFreeOnly } from "@/lib/ai/spend-scope.server";
import {
  aiLimits,
  providerChain,
  providerConfig,
  type ModelRole,
  type ProviderConfig,
  type ProviderName,
} from "@/lib/ai/config";
import { RevoraAiError, notConfigured, providerUnavailable } from "@/lib/ai/errors";
import { durableRuntimeFor } from "@/lib/ai/durable-health.server";
import { preserveGroupOrder, qualityFirstOrder } from "@/lib/ai/orchestration/order";
import { lovableAdapter } from "@/lib/ai/providers/lovable";

import { base64ByteLength } from "@/lib/ai/providers/shared";
import { compactMessages } from "@/lib/ai/context-compaction";
import { demoteDegradedPaid, noteProviderFailure, noteProviderSuccess } from "@/lib/ai/provider-backoff";
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
  lovable: lovableAdapter,
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


/* --------------------------------- chain --------------------------------- */

type Candidate = { config: ProviderConfig; model: string };

async function buildChain(
  caller: AiCaller,
  role: ModelRole,
  capable?: (model: string) => boolean,
  noSpend = false,
): Promise<Candidate[]> {
  // A no-spend scope means no AI at all: Lovable AI is the only team.
  if (noSpend) return [];
  const candidates: Candidate[] = [];
  for (const config of providerChain())
    for (const model of config.models[role].split(",").map((id) => id.trim()).filter(Boolean)) {
      if (capable && !capable(model)) continue;
      candidates.push({ config, model });
    }
  const ranked = qualityFirstOrder(candidates, (entry) => ({
    model: entry.model,
    provider: entry.config.name,
    healthy: providerHealthy({ caller, provider: entry.config.name, model: entry.model }),
    paid: true,
  }));
  // The configured roster order (best model per job) is preserved.
  const grouped = preserveGroupOrder(ranked, candidates, () => true);
  // LIVE ADMIN ROUTING: pins and pauses set in the Command Center.
  const { loadCommandSettings, applyRoutingOverrides } = await import("@/lib/ai/command-settings.server");
  const overridden = applyRoutingOverrides(grouped, (entry) => entry.model, await loadCommandSettings());
  const cooling = (entry: Candidate) => !providerHealthy({ caller, provider: entry.config.name, model: entry.model });
  const ordered = [...overridden.filter((entry) => !cooling(entry)), ...overridden.filter(cooling)];
  const failoverLimit = Number(process.env["AI_MAX_FAILOVER_CANDIDATES"] ?? "");
  const cap = Number.isFinite(failoverLimit) && failoverLimit > 0 ? Math.floor(failoverLimit) : Number.POSITIVE_INFINITY;
  return ordered.slice(0, cap);
}

/** Lovable AI status for the admin surface: last call and breaker state. */
export function aiRuntimeStatus() {
  const shared = durableRuntimeFor("lovable");
  return { last: lastAiOutcome(), providers: providerHealth(), sharedOpenUntil: shared?.openUntil ?? null };
}

/* ------------------------------- concurrency ------------------------------- */

const inFlight = new Map<string, number>();

function acquire(key: string, max: number) {
  const current = inFlight.get(key) ?? 0;
  if (current >= max) return false;
  inFlight.set(key, current + 1);
  return true;
}

/**
 * Waits a short while for a free slot instead of refusing at once. A first
 * build designs several sections in parallel while the specialist team runs
 * alongside it, so a momentary full house is normal; turning it into an error
 * dropped team members and failed sections for no reason.
 */
async function acquireWaiting(key: string, max: number, waitMs = 20_000) {
  const until = Date.now() + waitMs;
  while (!acquire(key, max)) {
    if (Date.now() >= until) return false;
    await wait(150 + Math.floor(Math.random() * 200));
  }
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
    /** How many free models have refused this request as too large so far. */
    compaction: number;
  }) => Promise<{ value: T; inputTokens?: number | null; outputTokens?: number | null }>,
  options?: {
    capable?: (model: string) => boolean;
    nextProviderOnInvalidRequest?: boolean;
    preferModels?: string[];
    avoidModels?: string[];
    /**
     * The caller already reserved this call against the shared paid ledgers
     * (monthly + daily) and settles it itself, so the router must not reserve
     * a second time. Only the builder's thinker lane sets this.
     */
    budgetReservedExternally?: boolean;
    /** External cancellation (a cancelled build stops the walk). */
    signal?: AbortSignal;
    /** Per-attempt timeout; clamped to the configured ceiling. */
    timeoutMs?: number;
    /** Whole-chain wall-clock budget; clamped to the configured deadline. */
    chainDeadlineMs?: number;
  },
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

  // REACHABILITY GATE, then QUALITY-FIRST ORDER. Paid providers only enter this
  // chain when an operator has explicitly opted out of free-only and zero-cost
  // mode; whatever is reachable is then ranked on capability and quality, with
  // cost last. An empty chain is an explicit AI failure; creative callers stop
  // rather than substituting a built-in website engine.
  const rawChain = await buildChain(
    caller,
    role,
    roleCapability(role, options?.capable),
    // A no-spend scope keeps every AI call out.
    scopedFreeOnly(),
  );
  const chain = applyModelPreference(rawChain, scopedPreferredModels(options?.preferModels), options?.avoidModels);
  const attemptTimeoutMs = clampPositive(options?.timeoutMs, limits.requestTimeoutMs);
  const chainBudgetMs = clampPositive(options?.chainDeadlineMs, chainDeadlineMs());
  if (chain.length === 0)
    throw notConfigured();

  const verdict = await checkAiLimits(caller);
  if (!verdict.allowed) throw new RevoraAiError(429, verdict.reason, { category: "rate_limited" });

  const concurrencyKey = caller.organizationId ?? caller.userId ?? "platform";
  if (!(await acquireWaiting(concurrencyKey, limits.maxConcurrentPerWorkspace)))
    throw new RevoraAiError(429, "Revora AI is already working on this workspace's requests.", {
      category: "rate_limited",
    });

  try {
    const ordered = chain;
    let lastError: unknown = null;
    // TEAM FAILOVER. One model failing says nothing about the rest of the pool,
    // so the chain keeps going until somebody answers — bounded by a wall-clock
    // deadline so a bad day can never hold a customer's build for an hour.
    const chainDeadline = Date.now() + chainBudgetMs;
    // A provider whose key was rejected or whose account is out of quota will
    // refuse every one of its models, so the rest of them are skipped.
    const deadProviders = new Set<string>();
    // A request the pool keeps calling malformed really is malformed; stop
    // after a few different providers agree instead of walking all of them.
    const invalidBy = new Set<string>();
    // Context-window refusals are counted apart: a long conversation that two
    // small models refuse is not "malformed", and must not use up the three
    // strikes reserved for requests the pool genuinely rejects.
    const tooLargeBy = new Set<string>();
    // Each free model that refuses the request as too large makes the next
    // one receive a shorter version of the conversation (context-compaction).
    let compaction = 0;

    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index]!;
      const config = candidate.config;
      if (deadProviders.has(config.name)) continue;
      if (index > 0 && Date.now() >= chainDeadline) break;
      const adapter = ADAPTERS[config.name];
      const model = candidate.model;
      const breakerScope = { caller, provider: config.name, model };
      const fallbackUsed = index > 0;

      // DAILY PAID CAP. A paid model is only called with today's paid budget
      // reserved; over the cap (or with the ledger unreachable) it is skipped
      // and the free pool answers instead. The reservation is settled in the
      // `finally` below on every path: the real cost on success; 0 only for a
      // definite unbilled rejection or a failure before the request left; the
      // estimate for a timeout, abort, network error or 5xx, which the
      // provider may still bill. It is awaited, not fire-and-forget, so a
      // worker that ends after the response cannot drop it.
      let paidReservation: PaidReservation | null = null;
      let paidActual = 0;
      // The builder's thinker lane holds one monthly + daily reservation for
      // its whole paid walk and settles it itself; the router must not
      // reserve a second time for each candidate it tries.
      if (options?.budgetReservedExternally !== true) {
        paidReservation = await reservePaidSpend(routerEstimate(model, limits.maxOutputTokens));
        if (!paidReservation) continue;
      }

      try {
      for (let attempt = 1; attempt <= limits.maxAttemptsPerProvider; attempt += 1) {
        if (attempt > 1 && Date.now() >= chainDeadline) break;
        const started = Date.now();
        const controller = new AbortController();
        // Never let one slow model eat past the chain budget either.
        // A free model that hangs past a minute is not coming back; move on so
        // one stalled provider cannot eat the whole chain (seen: 90s hangs).
        const attemptBudget = Math.max(1, Math.min(attemptTimeoutMs, chainDeadline - Date.now()));
        const timer = setTimeout(() => controller.abort(), attemptBudget);
        // A cancelled request (build aborted, page closed) aborts the in-flight
        // paid call too, so the walk does not burn budget after the caller left.
        const external = options?.signal ?? null;
        const onExternalAbort = () => controller.abort();
        if (external?.aborted) controller.abort();
        external?.addEventListener("abort", onExternalAbort);
        try {
          const result = await execute({ adapter, config, model, signal: controller.signal, compaction });
          noteSuccess(breakerScope);
noteProviderSuccess(config.name);
          lastOutcome = {
            at: Date.now(),
            provider: config.name,
            model,
            task: caller.task,
            ok: true,
            category: null,
            fallbackUsed,
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
          reportModelAnswered(config.name, model);
          if (paidReservation)
            paidActual += routerActual(model, result.inputTokens ?? null, result.outputTokens ?? null, paidReservation.estimate);
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
          // A paid attempt whose outcome is unknown may still be billed, so it
          // is charged at the estimate; only a definite rejection is free.
          if (paidReservation) paidActual += paidFailureCharge(error, paidReservation.estimate);
          if (error.retryable) noteFailure(breakerScope);
          noteProviderFailure(config.name, error.category);
          // The shared (cross-worker) health record is per PROVIDER, so only
          // provider-wide trouble goes into it. A retired model id or one bad
          // answer must not bench every other model that provider serves.
          lastOutcome = {
            at: Date.now(),
            provider: config.name,
            model,
            task: caller.task,
            ok: false,
            category: error.category,
            fallbackUsed,
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
            errorDetail: error.detail,
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
          if (error.category === "unauthorized" || error.category === "quota") deadProviders.add(config.name);
          if (error.category === "invalid_request" && options?.nextProviderOnInvalidRequest) break;
          // Free models have very different context windows (Groq's free tier
          // is small; NVIDIA, Mistral and others are large), so one model
          // refusing a long conversation moves on to the next free model.
          if (error.category === "too_large") {
            tooLargeBy.add(config.name);
            if (tooLargeBy.size >= 6) throw error;
            compaction += 1;
            break;
          }
          if (error.category === "invalid_request") {
            invalidBy.add(config.name);
            if (invalidBy.size >= 3) throw error;
            break;
          }
          if (!error.retryable) break;
          // In the free pool the next model is usually faster than waiting out
          // a rate limit or a slow model: only a transient 5xx is worth a retry
          // of the same model.
          if (attempt < limits.maxAttemptsPerProvider) {
            const backoff = error.retryAfterSeconds
              ? Math.min(error.retryAfterSeconds * 1000, 10_000)
              : 400 * attempt ** 2 + Math.floor(Math.random() * 250);
            await wait(backoff);
          }
        } finally {
          clearTimeout(timer);
          external?.removeEventListener("abort", onExternalAbort);
        }
      }
      } finally {
        if (paidReservation) await settlePaidSpend(paidReservation, paidActual);
      }
    }

    throw lastError instanceof RevoraAiError
      ? lastError
      : providerUnavailable(ordered[0]?.config.name ?? "cloudflare");
  } finally {
    release(concurrencyKey);
  }
}

/**
 * Provider answers that definitely refused the request before any generation
 * ran, so nothing is billed. Mirrors the paid picture lane.
 */
const UNBILLED_REJECTION_STATUSES = [400, 401, 402, 403, 404, 413, 422, 429];

/**
 * What one failed paid attempt is charged against the daily cap. A definite
 * HTTP rejection, or a failure raised before the request left (no provider
 * configured), costs nothing. A timeout, abort, network error after sending,
 * 5xx or unreadable answer may still be billed, so it counts at the estimate.
 */
export function paidFailureCharge(error: RevoraAiError, estimate: number): number {
  if (error.category === "not_configured") return 0;
  return UNBILLED_REJECTION_STATUSES.includes(error.status) ? 0 : estimate;
}

/** A caller override, only ever lowering the configured ceiling. */
function clampPositive(value: number | undefined, ceiling: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), ceiling) : ceiling;
}

/** Total time one logical call may spend walking the failover chain. */
function chainDeadlineMs() {
  const raw = Number(process.env["AI_CHAIN_DEADLINE_MS"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6 * 60_000;
}

/**
 * An exhausted allowance or a rejected key will not fix itself in a minute.
 * Rest the provider on the shared circuit after ONE such answer: quota until
 * the next UTC day (when free allowances reset, at least 15 minutes), a
 * rejected key for 6 hours. Other failures keep the normal 3-strike circuit.
 */
export function accountRestFor(category: string, now = Date.now()): { failureThreshold?: number; cooldownSeconds?: number } {
  if (category === "unauthorized") return { failureThreshold: 1, cooldownSeconds: 6 * 3600 };
  if (category === "quota") {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return { failureThreshold: 1, cooldownSeconds: Math.max(900, Math.ceil((next.getTime() - now) / 1000)) };
  }
  return {};
}

/** Failures that describe the whole provider, not one model or one answer. */
function providerWideFailure(error: RevoraAiError) {
  return (
    error.category === "rate_limited" ||
    error.category === "timeout" ||
    error.category === "provider_unavailable" ||
    error.category === "unauthorized" ||
    error.category === "quota"
  );
}

/** True when any message carries a picture, video or recording. */
function carriesAttachment(messages: AiRequest["messages"]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type !== "text"),
  );
}

/**
 * Per-job model choice: preferred paid models move to the front in the given
 * order; avoided ones (e.g. the model that wrote what is being reviewed) move
 * to the very back so they answer only if nobody else can. Nothing is removed.
 */
export function applyModelPreference<T extends { model: string }>(
  chain: T[],
  prefer?: string[],
  avoid?: string[],
): T[] {
  if (!prefer?.length && !avoid?.length) return chain;
  const avoided = new Set(avoid ?? []);
  const rank = (entry: T) => {
    const index = prefer ? prefer.indexOf(entry.model) : -1;
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  };
  const kept = chain.filter((entry) => !avoided.has(entry.model));
  const preferred = kept.filter((entry) => rank(entry) !== Number.POSITIVE_INFINITY).sort((a, b) => rank(a) - rank(b));
  const rest = kept.filter((entry) => rank(entry) === Number.POSITIVE_INFINITY);
  return [...preferred, ...rest, ...chain.filter((entry) => avoided.has(entry.model))];
}

/* ------------------------------ public surface ----------------------------- */

/** Router options derived from one text/structured request. */
function runOptionsFor(request: AiRequest) {
  return {
    nextProviderOnInvalidRequest: carriesAttachment(request.messages),
    ...(request.preferModels?.length ? { preferModels: request.preferModels } : {}),
    ...(request.avoidModels?.length ? { avoidModels: request.avoidModels } : {}),
    ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
    ...(request.chainDeadlineMs ? { chainDeadlineMs: request.chainDeadlineMs } : {}),
  };
}

/**
 * Internal lane options: only callers that hold their own monthly + daily
 * budget reservation may pass `budgetReservedExternally` (the builder's
 * thinker lane), and only long-running build steps pass a cancel `signal`.
 */
export interface RouterLaneOptions {
  budgetReservedExternally?: boolean;
  signal?: AbortSignal;
}

function laneOptions(lane?: RouterLaneOptions) {
  return {
    ...(lane?.budgetReservedExternally === true ? { budgetReservedExternally: true } : {}),
    ...(lane?.signal ? { signal: lane.signal } : {}),
  };
}

/** Plain text generation. */
export async function generateText(
  caller: AiCaller,
  request: AiRequest,
  lane?: RouterLaneOptions,
): Promise<AiTextResult> {
  guardRequest(request.messages);
  const limits = aiLimits();
  const outcome = await run(
    caller,
    request.role ?? "primary",
    async ({ adapter, config, model, signal, compaction }) => {
      const result = await adapter.chat({
        apiKey: config.apiKey,
        model,
        messages: compactMessages(request.messages, compaction),
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
    { ...runOptionsFor(request), ...laneOptions(lane) },
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
  lane?: RouterLaneOptions,
): Promise<AiJsonResult> {
  guardRequest(request.messages);
  const limits = aiLimits();
  // The shape check runs INSIDE the provider loop, so a model that answers with
  // something unparseable is treated as that provider failing: the next free
  // provider is tried, and only when none can answer does the caller fall back
  // to another AI provider in the capability chain.
  const outcome = await run(
    caller,
    request.role ?? "primary",
    async ({ adapter, config, model, signal, compaction }) => {
      const result = await adapter.chat({
        apiKey: config.apiKey,
        model,
        messages: compactMessages(request.messages, compaction),
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
    { ...runOptionsFor(request), ...laneOptions(lane) },
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
export function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = extractJsonObject(text);
  if (parsed) return parsed;
  throw new RevoraAiError(502, "Revora AI returned an unexpected response. Try rewording.", {
    category: "bad_response",
  });
}

/**
 * Free models wrap JSON in all sorts of packaging: a sentence before it, a
 * fenced block in the middle, thinking tags, a trailing comma, a list holding
 * one object. Every good answer in that packaging is recovered here so a model
 * that did the work is not thrown out over formatting.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "").trim();
  const attempts: string[] = [];
  const fenced = [...text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map((m) => m[1]!.trim());
  attempts.push(text, ...fenced);
  const start = text.indexOf("{");
  if (start >= 0) {
    // First balanced {...}, honouring strings, so prose around it is ignored.
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          attempts.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const candidate of attempts) {
    for (const body of [candidate, candidate.replace(/,\s*([}\]])/g, "$1")]) {
      try {
        let parsed = JSON.parse(body) as unknown;
        if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // try the next shape
      }
    }
  }
  return null;
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
    {
      // Provider catalogues group several incompatible image schemas under one
      // role. A model rejecting the request shape must hand off to the next
      // capability-matched model instead of aborting the whole picture request.
      nextProviderOnInvalidRequest: true,
    },
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

/* ------------------------- pinned paid picture call ------------------------- */

/**
 * ONE picture from the paid OpenAI image model, pinned by name.
 *
 * This lives in the router for the same reason every other call does: the
 * request guard, the timeout, the concurrency limit and the telemetry are the
 * router's, and no module outside it may reach a provider adapter. Spending
 * permission and the durable monthly cap are enforced by the caller before this
 * runs; this function never decides whether paid AI is allowed.
 */
/** Lovable AI picture models (verified against the authenticated listing). */
export const LOVABLE_IMAGE_MODELS = new Set([
  "openai/gpt-image-2.5-sunburst",
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2",
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-lite-image",
]);

/** Lovable ids carry the vendor prefix; Revora's tier names do not. */
export function lovableImageModelId(model: string): string {
  return model.includes("/") ? model : `openai/${model}`;
}

/**
 * ONE picture from a pinned Lovable AI image model. Spending permission and
 * the durable monthly cap are enforced by the caller before this runs.
 */
export async function callPinnedPaidImage(
  caller: AiCaller,
  prompt: string,
  model: string,
  /** Supplying a source picture makes this a precision EDIT. */
  source: { dataUrl: string; mimeType: string } | null = null,
): Promise<{ base64: string; mimeType: string; provider: ProviderName; model: string }> {
  const limits = aiLimits();
  if (prompt.length > limits.maxRequestChars)
    throw new RevoraAiError(413, "That image brief is too long for Revora AI.", { category: "too_large" });
  if (scopedFreeOnly())
    throw new RevoraAiError(503, "AI spending is switched off for this build.", { category: "not_configured" });
  const config = providerConfig();
  if (!config) throw notConfigured();
  const pictureModel = lovableImageModelId(model);

  const concurrencyKey = caller.organizationId ?? caller.userId ?? "platform";
  if (!(await acquireWaiting(concurrencyKey, limits.maxConcurrentPerWorkspace)))
    throw new RevoraAiError(429, "Revora AI is already working on this workspace's requests.", {
      category: "rate_limited",
    });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new RevoraAiError(408, "The picture provider did not finish within the time limit.", { category: "timeout", provider: "lovable" });
        controller.abort(error);
        reject(error);
      }, limits.requestTimeoutMs);
    });
    const result = await Promise.race([
      ADAPTERS.lovable.image({ apiKey: config.apiKey, model: pictureModel, prompt, source, signal: controller.signal }),
      deadline,
    ]);
    return { base64: result.base64, mimeType: result.mimeType, provider: "lovable", model: pictureModel };
  } finally {
    clearTimeout(timer);
    release(concurrencyKey);
  }
}

/** Whether a pinned picture model is in Lovable's verified picture roster. */
export async function paidImageModelReachable(model: string): Promise<{ available: boolean; detail: string }> {
  if (!providerConfig()) return { available: false, detail: "Lovable AI is not configured" };
  return LOVABLE_IMAGE_MODELS.has(lovableImageModelId(model))
    ? { available: true, detail: "available through Lovable AI" }
    : { available: false, detail: "not a Lovable AI picture model" };
}

/* -------------------------- pinned paid video call -------------------------- */

export type VideoOutcome =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; kind: "model_unavailable" | "provider_error" | "timed_out" | "invalid_video"; detail: string; charged: boolean };

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/**
 * ONE clip from a Lovable AI video model (Gemini Omni request body). Creates
 * one job, polls it, downloads the MP4. Never resubmits a failed job.
 */
export async function callPinnedPaidVideo(
  caller: AiCaller,
  input: { model: string; prompt: string; seconds: number; size: string },
  waiting: { maxWaitMs: number; pollMs: number },
): Promise<VideoOutcome> {
  const limits = aiLimits();
  if (input.prompt.length > limits.maxRequestChars)
    throw new RevoraAiError(413, "That video brief is too long for Revora AI.", { category: "too_large" });
  if (scopedFreeOnly())
    throw new RevoraAiError(503, "AI spending is switched off for this build.", { category: "not_configured" });
  const config = providerConfig();
  if (!config) throw notConfigured();

  const concurrencyKey = caller.organizationId ?? caller.userId ?? "platform";
  if (!(await acquireWaiting(concurrencyKey, limits.maxConcurrentPerWorkspace)))
    throw new RevoraAiError(429, "Revora AI is already working on this workspace's requests.", { category: "rate_limited" });
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    const portrait = input.size === "720x1280";
    const seconds = Math.min(10, Math.max(3, Math.round(input.seconds)));
    const created = await fetch(`${GATEWAY}/videos`, {
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
      await wait(waiting.pollMs);
      const polled = await fetch(`${GATEWAY}/videos/${encodeURIComponent(job.id)}`, { headers });
      if (!polled.ok) continue;
      const state = (await polled.json()) as { status?: string; error?: { message?: string } };
      if (state.status === "failed")
        return { ok: false, kind: "provider_error", detail: (state.error?.message ?? "job failed").slice(0, 160), charged: true };
      if (state.status !== "completed") continue;
      const content = await fetch(`${GATEWAY}/videos/${encodeURIComponent(job.id)}/content`, { headers });
      if (!content.ok) return { ok: false, kind: "provider_error", detail: `download answered ${content.status}`, charged: true };
      const bytes = new Uint8Array(await content.arrayBuffer());
      if (bytes.byteLength === 0) return { ok: false, kind: "invalid_video", detail: "empty clip", charged: true };
      reportModelAnswered("lovable", input.model);
      return { ok: true, bytes };
    }
  } finally {
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
