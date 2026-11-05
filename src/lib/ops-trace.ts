/**
 * BRF-03 — PLATFORM TRACES FOR GENERATION AND DEPLOY.
 *
 * Model calls already produce one `gen_ai.provider.call` span each
 * (ai/observability-export.server.ts). This adds the two operations around
 * them: a site generation attempt and a publish (plus its post-publish smoke
 * check), so a failure can be followed from the build down to the model call.
 *
 * Free / self-hosted only: every span is written as ONE structured log line
 * (`[revora-trace] {...}`, captured by the Worker's own logs) and, only when an
 * operator configured one, sent to an OTLP collector (Jaeger, Grafana Tempo,
 * SigNoz, self-hosted Langfuse). Nothing is sent anywhere by default.
 *
 * Privacy: no prompts, page content, error messages, emails, workspace or user
 * ids. Only an operation name, an allowlisted set of short attributes, an error
 * class name and timings. A generation span's trace id is the job id (not a
 * tenant id) so every attempt of one build lines up in one trace.
 */

export type OpsSpanName = "site.generate" | "site.deploy" | "site.deploy.smoke";
/** blocked = a gate refused on purpose (not paid, not ready). Not a system error. */
export type OpsOutcome = "ok" | "blocked" | "failed";

export const OPS_ATTRIBUTE_KEYS = [
  "revora.attempt",
  "revora.stage",
  "revora.failure_kind",
  "revora.block_reason",
  "revora.live_edit",
  "revora.restore",
  "revora.smoke.checks",
  "revora.smoke.failed_checks",
] as const;
export type OpsAttributeKey = (typeof OPS_ATTRIBUTE_KEYS)[number];
export type OpsAttributes = Partial<Record<OpsAttributeKey, string | number | boolean | null | undefined>>;

export type OpsSpan = {
  name: OpsSpanName;
  /** Job id for generation; any random id for one publish. Never a tenant/user id. */
  traceKey: string;
  startedAtMs: number;
  endedAtMs: number;
  outcome: OpsOutcome;
  errorType?: string | null;
  attributes?: OpsAttributes;
};

const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/;

/** A short machine label, or null. Free text (messages, urls, emails) never passes. */
export function safeOpsLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return SAFE_LABEL.test(v) ? v : null;
}

/** The error's class name (and HTTP status when it carries one), never its message. */
export function errorTypeOf(error: unknown): string {
  if (!error || typeof error !== "object") return "UnknownError";
  const ctorName = (error as { constructor?: { name?: unknown } }).constructor?.name;
  const ownName = (error as { name?: unknown }).name;
  const name = safeOpsLabel(typeof ctorName === "string" && ctorName !== "Object" ? ctorName : ownName) ?? "Error";
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status < 600 ? `${name}:${status}` : name;
}

/** Only allowlisted keys with short label / number / boolean values survive. */
export function cleanOpsAttributes(input: OpsAttributes | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input) return out;
  for (const key of OPS_ATTRIBUTE_KEYS) {
    const value = input[key];
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.max(0, Math.round(value));
    else {
      const label = safeOpsLabel(value);
      if (label) out[key] = label;
    }
  }
  return out;
}

const hex = (bytes: number) => {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
};

/** A UUID-shaped key becomes the 32-hex trace id; anything else gets a random one. */
export function traceIdFor(key: string): string {
  const value = String(key ?? "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value) ? value : hex(16);
}

/** The single structured log line (Workers logs / any log drain can parse it). */
export function opsLogRecord(span: OpsSpan) {
  return {
    trace: span.name,
    traceId: traceIdFor(span.traceKey),
    outcome: span.outcome,
    ms: Math.max(0, Math.round(span.endedAtMs - span.startedAtMs)),
    ...(span.errorType ? { errorType: safeOpsLabel(span.errorType) ?? "Error" } : {}),
    ...cleanOpsAttributes(span.attributes),
  };
}

type Attr = { key: string; value: { stringValue?: string; intValue?: string; boolValue?: boolean } };
const attr = (key: string, value: string | number | boolean): Attr =>
  typeof value === "number"
    ? { key, value: { intValue: String(value) } }
    : typeof value === "boolean"
      ? { key, value: { boolValue: value } }
      : { key, value: { stringValue: value } };
const nanos = (ms: number) => BigInt(Math.max(0, Math.trunc(ms * 1e6))).toString();

/** OTLP/HTTP JSON for one span (same resource as the model-call spans). */
export function buildOpsSpanPayload(span: OpsSpan, environment = "unknown") {
  const record = opsLogRecord(span);
  const attributes: Attr[] = [attr("revora.outcome", span.outcome)];
  for (const [key, value] of Object.entries(cleanOpsAttributes(span.attributes))) attributes.push(attr(key, value));
  if (record.errorType) attributes.push(attr("error.type", record.errorType));
  return {
    resourceSpans: [
      {
        resource: { attributes: [attr("service.name", "revora-growth-systems"), attr("deployment.environment.name", safeOpsLabel(environment) ?? "unknown")] },
        scopeSpans: [
          {
            scope: { name: "revora.ops", version: "1.0.0" },
            spans: [
              {
                traceId: record.traceId,
                spanId: hex(8),
                name: span.name,
                kind: 1,
                startTimeUnixNano: nanos(span.startedAtMs),
                endTimeUnixNano: nanos(Math.max(span.startedAtMs, span.endedAtMs)),
                attributes,
                // OTLP: 0 unset, 1 ok, 2 error. A deliberate gate refusal is not an error.
                status: span.outcome === "failed" ? { code: 2, ...(record.errorType ? { message: record.errorType } : {}) } : { code: span.outcome === "ok" ? 1 : 0 },
              },
            ],
          },
        ],
      },
    ],
  };
}
