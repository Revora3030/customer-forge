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

import { integrityOwnerMessage, isContentIntegrityError, ownerFieldName, parseIntegrityViolations } from "./content-integrity";
import { isStallMessage } from "./no-progress";

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
  "budget",
  "credits",
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
  credits: "Revora's AI credits ran out, so this build stopped before it finished. Nothing was published and your current website is unchanged. This is on Revora's side, not yours: press Retry build once the credits are topped up (finished sections are kept).",
  budget: "This build used its spending limit before it finished, so Revora stopped it to protect your credits. Nothing was published. You can start it again when you are ready.",
};

/** Fields an owner can fix in Business details, with the name shown to them. */
const FIELD_LABELS: Record<string, string> = {
  email: "business email",
  phone: "business phone",
  website: "website address",
  url: "website address",
  domain: "website address",
  business_name: "business name",
  name: "business name",
  city: "city",
  service_area: "service area",
  address: "business address",
  zip: "ZIP code",
  postal_code: "ZIP code",
  description: "business description",
  services: "services list",
  category: "business type",
};
const FIELD_WORDS = Object.keys(FIELD_LABELS).join("|");

/**
 * A plain input-validation failure (a malformed email, a required column left
 * empty, a value the database rejects) that names the field. The same input
 * fails the same way on every retry, so it is an owner fix, never a worker
 * fault. Returns the owner-facing field name, or null when the text names no
 * Business-details field (an "invalid API key" is not one).
 */
export function validationFieldFromError(message: string | null | undefined): string | null {
  const text = message ?? "";
  if (!text) return null;
  const patterns: RegExp[] = [
    // Postgres: null value in column "city" ... / value too long for ... column "name"
    new RegExp(`null value in column "(${FIELD_WORDS})"`, "i"),
    new RegExp(`column "(${FIELD_WORDS})"[^\\n]{0,60}(?:violates|too long|invalid)`, "i"),
    // Postgres check constraint named after the column, e.g. organizations_email_check
    new RegExp(`violates check constraint "[a-z_]*?_(${FIELD_WORDS})_(?:check|format|valid)[a-z_]*"`, "i"),
    // Zod / schema issues: "path":["email"] or email: Invalid email
    new RegExp(`"path"\\s*:\\s*\\[\\s*"(${FIELD_WORDS})"`, "i"),
    new RegExp(`\\b(${FIELD_WORDS})\\s*[:=-]\\s*(?:invalid|required|must be|is not a valid|not a valid)`, "i"),
    // Prose: "invalid email address", "email is not valid", "bad phone number"
    new RegExp(`\\b(?:invalid|malformed|bad|missing|empty)\\s+(?:business\\s+)?(${FIELD_WORDS})\\b`, "i"),
    new RegExp(`\\b(${FIELD_WORDS})\\s+(?:is|looks|appears)?\\s*(?:not valid|invalid|malformed|required|missing)\\b`, "i"),
  ];
  for (const pattern of patterns) {
    const key = pattern.exec(text)?.[1]?.toLowerCase();
    if (key && FIELD_LABELS[key]) return FIELD_LABELS[key];
  }
  return null;
}

function fixThisMessage(field: string): string {
  return `Fix this: ${field}. It is missing or not valid, so the build stopped instead of retrying. Update it in Business details, then press Build again.`;
}

/** The wording of a content integrity refusal (see contentIntegrityMessage and its details). */
const INTEGRITY_MESSAGE = /not real information yet|test or demo data|fixture data|this is placeholder text|placeholder address/i;

/** Ordered rules: the first match wins. Matched against the error text only. */
const RULES: { kind: BuildFailureKind; test: { test(text: string): boolean } }[] = [
  // The worker refused to spend more on this build (see build-spend.ts). Never retried.
  { kind: "budget", test: /reached its spending limit/i },
  // The business facts gate (content-integrity.ts) refused test, demo or
  // placeholder details. Only the owner can fix them, so it is never retried.
  // Normally caught by its error code; this is the fallback for a stored or
  // re-thrown message that lost the class.
  { kind: "intake_validation", test: INTEGRITY_MESSAGE },
  // The gateway answered 402: the workspace has no AI credits left. Retrying cannot help.
  { kind: "credits", test: /not enough credits|payment[_ ]required|insufficient[_ ]credits/i },
  // A design step that came back empty because the AI providers were slow or
  // busy is a provider problem, even when its message names pictures or fonts.
  // Without this rule it read "pictures" and told the owner their pictures
  // couldn't be generated, when the planning call had simply timed out.
  { kind: "provider", test: /AI design team did not (?:choose|name|plan) this site'?s|providers? did not answer in time/i },
  // A malformed email/phone or empty required column: the owner's fix, never a retry.
  { kind: "intake_validation", test: { test: (text: string) => validationFieldFromError(text) !== null } },
  { kind: "intake_validation", test: /still needs|missing (required )?(fact|detail)|invalid workspace|brief (isn'?t|is not) approved|fill in/i },
  { kind: "publish", test: /publish/i },
  { kind: "preview", test: /preview/i },
  { kind: "image", test: /\b(image|picture|photo|vision|reshoot)\b/i },
  { kind: "rendering", test: /render|composition|layout tree|materiali[sz]/i },
  { kind: "validation", test: /quality gate|validation|broken link|dead (link|button)|overflow|contrast|seo check|structured data/i },
  // A reviewer refusal that cites thin business facts cannot pass on retry:
  // the owner has to add details first, so it is intake, not a worker fault.
  { kind: "intake_validation", test: /facts establish only|establish only the business name/i },
  { kind: "content", test: /\bcopy\b|content|fact check|fabricat|unsupported claim|placeholder|reviewer refused/i },
  { kind: "infrastructure", test: /lease|worker|timeout|timed out|econn|network|fetch failed|database|connection|socket|5\d\d\b/i },
];

/**
 * Classifies a build error.
 * `status` is the provider/gateway HTTP status when the error came from the AI
 * gateway (0 otherwise).
 */
export function classifyBuildFailure(error: unknown, status = 0): BuildFailure {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // Owner details refused by the integrity gate: name the fields, never retry.
  if (isContentIntegrityError(error)) {
    const violations = Array.isArray(error.violations)
      ? error.violations.map((entry) => ({ field: entry.field, kind: entry.kind }))
      : parseIntegrityViolations(error.message);
    return { kind: "intake_validation", retryable: false, ownerMessage: integrityOwnerMessage(violations) };
  }
  let kind: BuildFailureKind;
  if (status === 402) kind = "credits";
  else if (status === 429 || status === 403 || (status >= 500 && status < 600)) kind = "provider";
  else kind = RULES.find((rule) => rule.test.test(message))?.kind ?? "infrastructure";
  const retryable = kind !== "intake_validation" && kind !== "budget" && kind !== "credits" && !(kind === "provider" && status === 403);
  const ownerMessage = kind === "intake_validation" ? intakeOwnerMessage(message) : OWNER_MESSAGES[kind];
  return { kind, retryable, ownerMessage };
}

/** The intake message, naming the refused fields when the error text lists them. */
function intakeOwnerMessage(message: string | null | undefined): string {
  const violations = parseIntegrityViolations(message);
  if (violations.length) return integrityOwnerMessage(violations);
  if (INTEGRITY_MESSAGE.test(message ?? "")) return integrityOwnerMessage([]);
  const field = validationFieldFromError(message);
  if (field) return fixThisMessage(field);
  return OWNER_MESSAGES.intake_validation;
}

/**
 * A failed row is final: nothing retries it. Kinds whose in-flight message
 * promises an automatic retry get an honest final wording instead.
 */
const FINAL_OWNER_MESSAGES: Partial<Record<BuildFailureKind, string>> = {
  infrastructure: "The build worker was interrupted and couldn't finish after several tries. Nothing was published. Press Build again to start it over.",
  provider: "The AI providers were unavailable or rate limited, so this build stopped. Nothing was published. Press Build again in a few minutes.",
  content: "The AI team couldn't produce copy that passed Revora's fact checks after several tries. Nothing was published. Press Build again for a fresh draft.",
};

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

/** Short owner-facing label for each kind, shown next to a failed build. */
export const FAILURE_KIND_LABELS: Record<BuildFailureKind | "cancelled", string> = {
  intake_validation: "Business details need fixing",
  provider: "AI provider unavailable",
  content: "Copy didn't pass fact checks",
  image: "Pictures couldn't be finished",
  rendering: "Page assembly failed",
  preview: "Preview couldn't be prepared",
  publish: "Publish didn't complete",
  validation: "Quality checks failed",
  infrastructure: "Build worker interrupted",
  credits: "AI credits ran out",
  budget: "Spending limit reached",
  cancelled: "Cancelled by you",
};

/**
 * What the owner sees for a failed or cancelled build: a short label, the
 * plain-language explanation for its kind, and whether pressing Build again is
 * the right next step. Reads the structured column first, then the tag.
 */
export function describeBuildFailure(row: {
  status?: string | null;
  failure_kind?: string | null;
  error_message?: string | null;
}): { label: string; message: string; canRetry: boolean; fixFields?: string[] } | null {
  if (row.status === "cancelled" || row.failure_kind === "cancelled")
    return { label: FAILURE_KIND_LABELS.cancelled, message: "The build was stopped before it finished. Nothing was published.", canRetry: true };
  if (row.status !== "failed") return null;
  const stored = row.failure_kind as BuildFailureKind | null | undefined;
  const kind = stored && (BUILD_FAILURE_KINDS as readonly string[]).includes(stored) ? stored : readFailureKind(row.error_message);
  if (!kind) return { label: "Build didn't finish", message: untaggedMessage(row.error_message) || "The build didn't finish.", canRetry: true };
  // A build ended by the no-progress guard carries its own plain message.
  if (isStallMessage(row.error_message)) return { label: FAILURE_KIND_LABELS[kind], message: untaggedMessage(row.error_message), canRetry: true };
  if (kind === "intake_validation") {
    const text = untaggedMessage(row.error_message);
    const fixFields = intakeFixFields(text);
    return { label: FAILURE_KIND_LABELS[kind], message: intakeOwnerMessage(text), canRetry: true, ...(fixFields.length ? { fixFields } : {}) };
  }
  return { label: FAILURE_KIND_LABELS[kind], message: FINAL_OWNER_MESSAGES[kind] ?? OWNER_MESSAGES[kind], canRetry: true };
}

/**
 * The Business-details fields an intake refusal names, in owner wording and
 * without repeats (T051: the builder shows them as an inline "fix this field"
 * prompt). Empty when the error names no field.
 */
export function intakeFixFields(message: string | null | undefined): string[] {
  const names = parseIntegrityViolations(message).flatMap((entry) => entry.field.split(/,\s*/).map(ownerFieldName));
  const single = names.length ? null : validationFieldFromError(message);
  return [...new Set(single ? [single] : names)].filter(Boolean);
}

/** The message without its kind tag, for display. */
export function untaggedMessage(message: string | null | undefined): string {
  return (message ?? "").replace(PREFIX, "");
}
