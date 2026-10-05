/**
 * Build failure classification (spec C).
 *
 * Every failed or retried first-build attempt is labelled with exactly one
 * failure kind so the owner sees an honest, actionable message and operators
 * can group failures. Pure and dependency-free: it runs in the worker, the
 * admin views and unit tests.
 *
 * The kind is persisted as a stable `[kind]` prefix on
 * `generation_jobs.error_message` (no schema change), and read back with
 * `readFailureKind()`.
 */

export const BUILD_FAILURE_KINDS = [
  "intake_validation",
  "provider",
  "content",
  "image",
  "rendering",
  "preview",
  "publish",
  "validation",
  "infrastructure",
] as const;

export type BuildFailureKind = (typeof BUILD_FAILURE_KINDS)[number];

export type BuildFailure = {
  kind: BuildFailureKind;
  /** Whether another attempt can reasonably succeed without owner action. */
  retryable: boolean;
  /** Plain-language explanation for the owner (no internals, no secrets). */
  ownerMessage: string;
};

const OWNER_MESSAGES: Record<BuildFailureKind, string> = {
  intake_validation: "Some business details Revora needs are missing or invalid. Add them and press Build again.",
  provider: "An AI provider was unavailable or rate limited. Revora retries automatically; nothing was lost.",
  content: "The AI team couldn't produce copy that passed Revora's fact checks. Revora retries with a fresh draft.",
  image: "Pictures couldn't be generated or checked this time. Your pages are kept; pictures can be retried on their own.",
  rendering: "A page couldn't be assembled safely. Your previous draft is unchanged.",
  preview: "The preview couldn't be prepared. Your saved pages are safe; reload the preview to try again.",
  publish: "Publishing didn't complete. Your live site is unchanged.",
  validation: "The draft didn't pass Revora's quality checks (links, forms, mobile or SEO). It isn't marked ready.",
  infrastructure: "The build worker was interrupted. Revora resumes it automatically.",
};

/** Ordered rules: the first match wins. Matched against the error text only. */
const RULES: { kind: BuildFailureKind; test: RegExp }[] = [
  { kind: "intake_validation", test: /still needs|missing (required )?(fact|detail)|invalid workspace|brief (isn'?t|is not) approved|fill in/i },
  { kind: "publish", test: /publish/i },
  { kind: "preview", test: /preview/i },
  { kind: "image", test: /\b(image|picture|photo|vision|reshoot)\b/i },
  { kind: "rendering", test: /render|composition|layout tree|materiali[sz]/i },
  { kind: "validation", test: /quality gate|validation|broken link|dead (link|button)|overflow|contrast|seo check|structured data/i },
  { kind: "content", test: /\bcopy\b|content|fact check|fabricat|unsupported claim|placeholder/i },
  { kind: "infrastructure", test: /lease|worker|timeout|timed out|econn|network|fetch failed|database|connection|socket|5\d\d\b/i },
];

/**
 * Classifies a build error.
 * `status` is the provider/gateway HTTP status when the error came from the AI
 * gateway (0 otherwise).
 */
export function classifyBuildFailure(error: unknown, status = 0): BuildFailure {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  let kind: BuildFailureKind;
  if (status === 429 || status === 402 || status === 403 || (status >= 500 && status < 600)) kind = "provider";
  else kind = RULES.find((rule) => rule.test.test(message))?.kind ?? "infrastructure";
  const retryable = kind !== "intake_validation" && !(kind === "provider" && (status === 402 || status === 403));
  return { kind, retryable, ownerMessage: OWNER_MESSAGES[kind] };
}

const PREFIX = /^\[([a-z_]+)\]\s*/;

/** Adds the stable `[kind]` prefix to a stored error message (idempotent). */
export function tagFailureMessage(kind: BuildFailureKind, message: string): string {
  const clean = message.replace(PREFIX, "").trim();
  return `[${kind}] ${clean}`.slice(0, 1000);
}

/** Reads the failure kind back from a stored error message, if tagged. */
export function readFailureKind(message: string | null | undefined): BuildFailureKind | null {
  const match = PREFIX.exec(message ?? "");
  const kind = match?.[1] as BuildFailureKind | undefined;
  return kind && (BUILD_FAILURE_KINDS as readonly string[]).includes(kind) ? kind : null;
}

/** The message without its kind tag, for display. */
export function untaggedMessage(message: string | null | undefined): string {
  return (message ?? "").replace(PREFIX, "");
}
