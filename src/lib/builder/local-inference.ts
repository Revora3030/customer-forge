/**
 * REVORA LOCAL INFERENCE ENGINE — MASTER EDITION
 *
 * Purpose:
 * - Use an on-device browser language model when one is actually available.
 * - Keep Revora's builder free-first and privacy-first.
 * - Never make local AI a required dependency.
 * - Never let an unavailable, broken, slow, or malicious model break the builder.
 * - Keep factual website content conservative and deterministic.
 *
 * Supported environments:
 * - Browser environments exposing the emerging LanguageModel API.
 * - Browser environments exposing navigator.ai.languageModel-style APIs.
 * - Future compatible implementations can be adapted through the small adapter
 *   layer below without changing the rest of Revora.
 *
 * Important:
 * This module does NOT perform network requests.
 * This module does NOT import an AI SDK.
 * This module does NOT require an API key.
 * This module does NOT replace Revora's deterministic builder.
 */

type PromptResult = string | null | undefined;

type LocalModelSession = {
  prompt?: (input: string, options?: unknown) => Promise<PromptResult>;
  promptStreaming?: (
    input: string,
    options?: unknown,
  ) => AsyncIterable<string>;
  destroy?: () => void;
};

type AvailabilityState =
  | "available"
  | "readily"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown";

type LocalModelApi = {
  availability?: () => Promise<string>;
  create?: (options?: unknown) => Promise<LocalModelSession>;
};

type NavigatorWithAI = Navigator & {
  ai?: {
    languageModel?: LocalModelApi;
  };
};

type WindowWithLocalAI = Window & {
  LanguageModel?: LocalModelApi;
  ai?: {
    languageModel?: LocalModelApi;
  };
};

export type LocalInferenceStatus =
  | "unsupported"
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown"
  | "error";

export type LocalInferenceCapabilities = {
  supported: boolean;
  status: LocalInferenceStatus;
  canGenerate: boolean;
  privateByDefault: boolean;
  networkRequired: false;
  provider: "browser-local" | "none";
};

export type LocalPolishOptions = {
  /**
   * Maximum time allowed for the local model.
   * The deterministic/original text always wins on timeout.
   */
  timeoutMs?: number;

  /**
   * When true, only extremely conservative wording changes are accepted.
   * This is the default.
   */
  strict?: boolean;

  /**
   * Optional instruction describing the writing style.
   * This must not request factual invention.
   */
  style?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TEXT_LENGTH = 12;
const MAX_TEXT_LENGTH = 1_200;
const MAX_OUTPUT_LENGTH = 1_800;

const availabilityCache: {
  expiresAt: number;
  result: LocalInferenceCapabilities;
} = {
  expiresAt: 0,
  result: {
    supported: false,
    status: "unsupported",
    canGenerate: false,
    privateByDefault: true,
    networkRequired: false,
    provider: "none",
  },
};

const AVAILABILITY_CACHE_MS = 30_000;

/* -------------------------------------------------------------------------- */
/* Environment detection                                                     */
/* -------------------------------------------------------------------------- */

function getModelApi(): LocalModelApi | null {
  try {
    if (typeof window === "undefined") return null;

    const browserWindow = window as WindowWithLocalAI;

    const direct =
      browserWindow.LanguageModel ??
      browserWindow.ai?.languageModel ??
      null;

    if (direct) return direct;

    if (typeof navigator !== "undefined") {
      const browserNavigator = navigator as NavigatorWithAI;
      return browserNavigator.ai?.languageModel ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Normalization helpers                                                      */
/* -------------------------------------------------------------------------- */

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(500, Math.min(20_000, Math.round(value)));
}

function clampOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_LENGTH) return value;

  return value.slice(0, MAX_OUTPUT_LENGTH).trim();
}

function normalizedForComparison(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Safety / fact preservation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Website copy must not silently gain factual claims through local AI.
 *
 * We preserve:
 * - numbers
 * - prices
 * - percentages
 * - dates
 * - emails
 * - URLs/domains
 * - phone-like values
 * - common legal/compliance identifiers
 *
 * This does not prove semantic equivalence. It is deliberately conservative.
 */

function extractProtectedTokens(text: string): string[] {
  const source = normalizeText(text);

  const patterns = [
    /\$[\d,]+(?:\.\d{1,2})?/g,
    /€[\d,]+(?:\.\d{1,2})?/g,
    /£[\d,]+(?:\.\d{1,2})?/g,
    /\b\d+(?:\.\d+)?%/g,
    /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
    /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\b/gi,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi,
    /\b(?:LLC|L\.L\.C\.|INC|INC\.|LTD|CORP|CORP\.)\b/gi,
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const found = source.match(pattern);
    if (found) matches.push(...found);
  }

  return Array.from(
    new Set(matches.map((token) => token.trim()).filter(Boolean)),
  );
}

function containsProtectedTokens(
  output: string,
  source: string,
): boolean {
  const originalTokens = extractProtectedTokens(source);
  const result = normalizedForComparison(output);

  return originalTokens.every((token) =>
    result.includes(normalizedForComparison(token)),
  );
}

/**
 * Reject obvious model behaviors that would make the result less trustworthy.
 */
function containsFabricationSignals(text: string): boolean {
  const source = normalizedForComparison(text);

  const forbiddenPatterns = [
    /\bguarantee(?:s|d)?\b/,
    /\bguaranteed\b/,
    /\b#1\b/,
    /\bnumber one\b/,
    /\bbest in (?:the|your) (?:area|city|industry)\b/,
    /\baward[- ]winning\b/,
    /\baward winning\b/,
    /\b5[- ]star\b/,
    /\bfive[- ]star\b/,
    /\btop[- ]rated\b/,
    /\bmost trusted\b/,
    /\btrusted by thousands\b/,
    /\btrusted by millions\b/,
    /\bresults guaranteed\b/,
    /\b100% guaranteed\b/,
    /\bdouble your\b/,
    /\btriple your\b/,
    /\b\d+x\b/,
  ];

  return forbiddenPatterns.some((pattern) => pattern.test(source));
}

function isReasonableRewrite(
  original: string,
  candidate: string,
  strict: boolean,
): boolean {
  const source = normalizeText(original);
  const output = normalizeText(candidate);

  if (!source || !output) return false;

  if (output.length < 4) return false;

  if (output.length > MAX_OUTPUT_LENGTH) return false;

  /*
   * Avoid a model returning an essay when asked to polish a sentence.
   */
  if (output.length > Math.max(source.length * 2.5, source.length + 500)) {
    return false;
  }

  /*
   * Preserve factual tokens.
   */
  if (!containsProtectedTokens(output, source)) {
    return false;
  }

  /*
   * Never accept obvious fabricated marketing claims.
   */
  if (containsFabricationSignals(output)) {
    return false;
  }

  /*
   * Strict mode is intentionally conservative.
   */
  if (strict) {
    const originalSentenceCount =
      source.split(/[.!?]+/).filter(Boolean).length;

    const outputSentenceCount =
      output.split(/[.!?]+/).filter(Boolean).length;

    if (outputSentenceCount > originalSentenceCount + 1) {
      return false;
    }

    if (output.split(/\s+/).length > source.split(/\s+/).length * 1.6) {
      return false;
    }
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

function stateFromAvailability(value: unknown): AvailabilityState {
  if (typeof value !== "string") return "unknown";

  const state = value.toLowerCase().trim();

  switch (state) {
    case "available":
    case "readily":
      return "available";

    case "downloadable":
      return "downloadable";

    case "downloading":
      return "downloading";

    case "unavailable":
      return "unavailable";

    default:
      return "unknown";
  }
}

function capabilitiesFromState(
  state: AvailabilityState,
): LocalInferenceCapabilities {
  switch (state) {
    case "available":
    case "readily":
      return {
        supported: true,
        status: "available",
        canGenerate: true,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };

    case "downloadable":
      return {
        supported: true,
        status: "downloadable",
        canGenerate: false,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };

    case "downloading":
      return {
        supported: true,
        status: "downloading",
        canGenerate: false,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };

    case "unavailable":
      return {
        supported: true,
        status: "unavailable",
        canGenerate: false,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };

    default:
      return {
        supported: true,
        status: "unknown",
        canGenerate: false,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };
  }
}

/**
 * Returns a detailed capability snapshot.
 *
 * This never throws.
 */
export async function getLocalInferenceCapabilities(): Promise<LocalInferenceCapabilities> {
  const now = Date.now();

  if (availabilityCache.expiresAt > now) {
    return availabilityCache.result;
  }

  const model = getModelApi();

  if (!model || typeof model.create !== "function") {
    const result: LocalInferenceCapabilities = {
      supported: false,
      status: "unsupported",
      canGenerate: false,
      privateByDefault: true,
      networkRequired: false,
      provider: "none",
    };

    availabilityCache.result = result;
    availabilityCache.expiresAt = now + AVAILABILITY_CACHE_MS;

    return result;
  }

  try {
    if (typeof model.availability !== "function") {
      const result: LocalInferenceCapabilities = {
        supported: true,
        status: "available",
        canGenerate: true,
        privateByDefault: true,
        networkRequired: false,
        provider: "browser-local",
      };

      availabilityCache.result = result;
      availabilityCache.expiresAt = now + AVAILABILITY_CACHE_MS;

      return result;
    }

    const rawState = await model.availability();
    const state = stateFromAvailability(rawState);
    const result = capabilitiesFromState(state);

    availabilityCache.result = result;
    availabilityCache.expiresAt = now + AVAILABILITY_CACHE_MS;

    return result;
  } catch {
    const result: LocalInferenceCapabilities = {
      supported: true,
      status: "error",
      canGenerate: false,
      privateByDefault: true,
      networkRequired: false,
      provider: "browser-local",
    };

    availabilityCache.result = result;
    availabilityCache.expiresAt = now + 5_000;

    return result;
  }
}

/**
 * Simple compatibility helper retained for existing callers.
 */
export async function hasLocalInference(): Promise<boolean> {
  const capabilities = await getLocalInferenceCapabilities();

  return capabilities.canGenerate;
}

/* -------------------------------------------------------------------------- */
/* Prompt construction                                                        */
/* -------------------------------------------------------------------------- */

function buildSystemInstruction(
  style: string | undefined,
  strict: boolean,
): string {
  const safeStyle = normalizeText(style ?? "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180);

  const strictRule = strict
    ? "Make only conservative wording improvements. Preserve the original meaning and structure."
    : "Improve clarity, flow, readability, and professional presentation without changing facts.";

  const styleRule = safeStyle
    ? `Preferred style: ${safeStyle}.`
    : "Use clear, concise, professional website language.";

  return [
    "You are Revora's private on-device copy editor.",
    "You are editing existing website copy, not inventing business information.",
    strictRule,
    styleRule,
    "Preserve every factual detail exactly.",
    "Do not add prices, discounts, reviews, ratings, awards, guarantees, licenses, certifications, locations, statistics, customer counts, performance claims, or business results.",
    "Do not invent services or products.",
    "Do not add contact information.",
    "Do not add URLs.",
    "Do not use hype that implies an unsupported factual claim.",
    "Return only the revised copy.",
    "Do not explain your changes.",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Safe timeout                                                               */
/* -------------------------------------------------------------------------- */

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Session handling                                                           */
/* -------------------------------------------------------------------------- */

async function createSession(
  model: LocalModelApi,
  instruction: string,
): Promise<LocalModelSession | null> {
  if (typeof model.create !== "function") return null;

  try {
    const session = await model.create({
      initialPrompts: [
        {
          role: "system",
          content: instruction,
        },
      ],
    });

    if (!session) return null;

    return session;
  } catch {
    return null;
  }
}

function destroySession(session: LocalModelSession | null): void {
  if (!session || typeof session.destroy !== "function") return;

  try {
    session.destroy();
  } catch {
    // Local model cleanup must never affect the builder.
  }
}

/* -------------------------------------------------------------------------- */
/* Local generation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Performs a single private local rewrite.
 *
 * Returns null when local inference cannot safely be used.
 */
export async function localRewrite(
  text: string,
  options: LocalPolishOptions = {},
): Promise<string | null> {
  const source = normalizeText(text);

  if (
    source.length < MIN_TEXT_LENGTH ||
    source.length > MAX_TEXT_LENGTH
  ) {
    return null;
  }

  const strict = options.strict !== false;
  const timeoutMs = clampTimeout(options.timeoutMs);

  const capabilities = await getLocalInferenceCapabilities();

  if (!capabilities.canGenerate) {
    return null;
  }

  const model = getModelApi();

  if (!model) return null;

  const instruction = buildSystemInstruction(
    options.style,
    strict,
  );

  const session = await withTimeout(
    createSession(model, instruction),
    timeoutMs,
  );

  if (!session) return null;

  try {
    if (typeof session.prompt !== "function") {
      return null;
    }

    const result = await withTimeout(
      session.prompt(source),
      timeoutMs,
    );

    if (typeof result !== "string") return null;

    const output = clampOutput(normalizeText(result));

    if (!isReasonableRewrite(source, output, strict)) {
      return null;
    }

    return output;
  } catch {
    return null;
  } finally {
    destroySession(session);
  }
}

/**
 * Streaming-capable local rewrite.
 *
 * This is intentionally conservative:
 * it collects the complete result before returning so downstream builder
 * code never has to handle partial or malformed website content.
 */
export async function localRewriteStreaming(
  text: string,
  options: LocalPolishOptions = {},
): Promise<string | null> {
  const source = normalizeText(text);

  if (
    source.length < MIN_TEXT_LENGTH ||
    source.length > MAX_TEXT_LENGTH
  ) {
    return null;
  }

  const strict = options.strict !== false;
  const timeoutMs = clampTimeout(options.timeoutMs);

  const capabilities = await getLocalInferenceCapabilities();

  if (!capabilities.canGenerate) {
    return null;
  }

  const model = getModelApi();

  if (!model) return null;

  const instruction = buildSystemInstruction(
    options.style,
    strict,
  );

  const session = await withTimeout(
    createSession(model, instruction),
    timeoutMs,
  );

  if (!session) return null;

  try {
    if (typeof session.promptStreaming !== "function") {
      return localRewrite(source, options);
    }

    const stream = session.promptStreaming(source);

    if (!stream) return null;

    const collect = async (): Promise<string | null> => {
      let combined = "";

      for await (const chunk of stream) {
        if (typeof chunk !== "string") continue;

        combined += chunk;

        if (combined.length > MAX_OUTPUT_LENGTH) {
          return null;
        }
      }

      return combined;
    };

    const result = await withTimeout(collect(), timeoutMs);

    if (typeof result !== "string") return null;

    const output = clampOutput(normalizeText(result));

    if (!isReasonableRewrite(source, output, strict)) {
      return null;
    }

    return output;
  } catch {
    return null;
  } finally {
    destroySession(session);
  }
}

/* -------------------------------------------------------------------------- */
/* Public compatibility API                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Existing builder API.
 *
 * Important behavior:
 * - Always returns the original text on failure.
 * - Never throws.
 * - Never requires local AI.
 * - Never sends text over the network.
 */
export async function localPolish(
  text: string,
  options: LocalPolishOptions = {},
): Promise<string> {
  const source = typeof text === "string" ? text : "";

  if (
    source.trim().length < MIN_TEXT_LENGTH ||
    source.trim().length > MAX_TEXT_LENGTH
  ) {
    return source;
  }

  try {
    const result = await localRewrite(source, {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      strict: options.strict ?? true,
      ...(options.style !== undefined ? { style: options.style } : {}),
    });

    return result ?? source;
  } catch {
    return source;
  }
}

/**
 * Fast synchronous capability check.
 *
 * Useful for UI hints where an async capability probe would be unnecessary.
 */
export function localInferenceSupported(): boolean {
  try {
    return Boolean(getModelApi());
  } catch {
    return false;
  }
}

/**
 * Clears the short-lived capability cache.
 *
 * Useful after a browser model finishes downloading.
 */
export function resetLocalInferenceCache(): void {
  availabilityCache.expiresAt = 0;
  availabilityCache.result = {
    supported: false,
    status: "unsupported",
    canGenerate: false,
    privateByDefault: true,
    networkRequired: false,
    provider: "none",
  };
}

/**
 * Safe diagnostic summary for Revora UI.
 *
 * Contains no prompts, website content, customer data, or model output.
 */
export async function localInferenceSummary(): Promise<string> {
  const capabilities = await getLocalInferenceCapabilities();

  if (!capabilities.supported) {
    return "On-device AI is not available in this browser.";
  }

  if (capabilities.canGenerate) {
    return "On-device AI is available privately in this browser.";
  }

  if (capabilities.status === "downloadable") {
    return "On-device AI is supported but the local model is not ready yet.";
  }

  if (capabilities.status === "downloading") {
    return "The browser is preparing its local AI model.";
  }

  if (capabilities.status === "unavailable") {
    return "On-device AI is supported but currently unavailable.";
  }

  return "On-device AI availability could not be confirmed.";
}