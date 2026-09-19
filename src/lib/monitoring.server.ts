/**
 * Production error tracking.
 *
 * Every crash, failed API call and slow/failed job is recorded in
 * public.error_events (readable by platform admins, and by a workspace for its
 * own rows) and, when SENTRY_DSN is configured, forwarded to Sentry through its
 * plain HTTP envelope endpoint — no SDK, so nothing here breaks the Worker
 * bundle. With no DSN configured, in-app tracking still works on its own.
 */
import { describeError } from "@/lib/error-capture";

export type ErrorLevel = "fatal" | "error" | "warning" | "info";
export type ErrorSource = "server" | "client" | "job" | "webhook";

export type CapturedError = {
  message: string;
  stack?: string | null;
  level?: ErrorLevel;
  source?: ErrorSource;
  route?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  organizationId?: string | null;
  context?: Record<string, unknown>;
};

const MAX_MESSAGE = 500;
const MAX_STACK = 8000;

const SENSITIVE_QUERY_PARAM =
  /([?&](?:access_token|refresh_token|api[_-]?key|client[_-]?secret|token|secret|password|signature|sig|code)=)[^&#\s)]+/gi;
const CREDENTIAL_VALUE =
  /\b(?:sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{20,})\b/g;
const AUTH_VALUE = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const SENSITIVE_HEADER =
  /((?:authorization|cookie|x-api-key|x-auth-token|x-signature)\s*[:=]\s*)[^\s,;]+/gi;

/**
 * Redacts credential-shaped values from error messages and stacks before they
 * reach persistent telemetry or a third-party error service. Error messages
 * can contain request URLs or upstream responses, so context-only redaction is
 * not sufficient.
 */
export function sanitizeErrorText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return String(value)
    .replace(SENSITIVE_QUERY_PARAM, "$1[redacted]")
    .replace(CREDENTIAL_VALUE, "[redacted]")
    .replace(AUTH_VALUE, "[redacted]")
    .replace(SENSITIVE_HEADER, "$1[redacted]");
}

/** Stable grouping key: same failure in the same place = same fingerprint. */
export function fingerprintOf(input: {
  message: string;
  route?: string | null | undefined;
  stack?: string | null | undefined;
}) {
  const frame =
    (input.stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("at ")) ?? "";
  const normalized = input.message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\d+/g, "<n>")
    .slice(0, 180);
  return `${input.route ?? "-"}|${normalized}|${frame.slice(0, 120)}`;
}

/** Never let secrets or huge payloads reach the error store. */
const SENSITIVE = /(key|token|secret|password|authorization|cookie|dsn|signature)/i;

export function sanitizeContext(context: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (SENSITIVE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      out[key] = typeof value === "string" ? value.slice(0, 500) : value;
    } else {
      out[key] = String(JSON.stringify(value) ?? "").slice(0, 500);
    }
  }
  return out;
}

function environment() {
  return process.env["NODE_ENV"] === "production" ? "production" : "development";
}

function stacktraceFrames(stack: string | null | undefined) {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^at\\s+(.*?)\\s+\\((.*?):(\\d+):(\\d+)\\)$/) ??
        line.match(/^at\\s+(.*?):(\\d+):(\\d+)\\$/);
      if (!match) return null;
      if (match.length === 5) {
        const [, fn, rawUrl, lineNo, colNo] = match;
        return {
          function: fn || "<anonymous>",
          filename: String(rawUrl).split(/[?#]/, 1)[0],
          lineno: Number(lineNo),
          colno: Number(colNo),
          in_app: true,
        };
      }
      const [, rawUrl, lineNo, colNo] = match;
      return {
        function: "<anonymous>",
        filename: String(rawUrl).split(/[?#]/, 1)[0],
        lineno: Number(lineNo),
        colno: Number(colNo),
        in_app: true,
      };
    })
    .filter((frame): frame is NonNullable<typeof frame> => frame !== null)
    .slice(-50);
}

async function forwardToSentry(event: CapturedError, fingerprint: string): Promise<boolean> {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return false;
  try {
    // DSN shape: https://<publicKey>@<host>/<projectId>
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const publicKey = url.username;
    if (!projectId || !publicKey) return false;
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
    const header = JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ""),
      sent_at: new Date().toISOString(),
      dsn,
    });
    const payload = JSON.stringify({
      level: event.level ?? "error",
      platform: "javascript",
      environment: environment(),
      release: process.env["SENTRY_RELEASE"] ?? undefined,
      fingerprint: [fingerprint],
      transaction: event.route ?? undefined,
      tags: { source: event.source ?? "server", status: event.statusCode ?? undefined },
      extra: sanitizeContext(event.context),
      exception: {
        values: [
          {
            type: event.source === "client" ? "ClientError" : "ServerError",
            value: event.message.slice(0, MAX_MESSAGE),
            stacktrace: event.stack ? { frames: stacktraceFrames(event.stack) } : undefined,
          },
        ],
      },
      message: { formatted: event.message.slice(0, MAX_MESSAGE) },
    });
    const body = `${header}\n${JSON.stringify({ type: "event" })}\n${payload}\n`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=revora/1.0`,
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Records one error. Never throws: monitoring failing must not turn a handled
 * error into a second crash.
 */
export async function captureError(
  input: CapturedError | unknown,
  extra: Partial<CapturedError> = {},
) {
  try {
    // Error instances keep `message`/`stack` non-enumerable, so they must be
    // read explicitly — spreading one silently loses the actual failure text.
    const described: CapturedError =
      input instanceof Error
        ? { message: input.message || describeError(input), stack: input.stack ?? null }
        : input && typeof input === "object" && "message" in (input as object)
          ? { ...(input as CapturedError) }
          : { message: describeError(input) };
    const event: CapturedError = { ...described, ...extra };
    const message = (
      sanitizeErrorText(String(event.message ?? "Unknown error")) ?? "Unknown error"
    ).slice(0, MAX_MESSAGE);
    const stack = event.stack
      ? (sanitizeErrorText(String(event.stack))?.slice(0, MAX_STACK) ?? null)
      : null;
    const route = event.route
      ? (sanitizeErrorText(String(event.route))?.slice(0, 500) ?? null)
      : null;
    const sanitizedEvent = { ...event, message, stack, route };
    const fingerprint = fingerprintOf(sanitizedEvent);
    const forwarded = await forwardToSentry(sanitizedEvent, fingerprint);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("error_events").insert({
      organization_id: event.organizationId ?? null,
      fingerprint,
      level: event.level ?? "error",
      source: event.source ?? "server",
      message,
      stack,
      route,
      status_code: event.statusCode ?? null,
      duration_ms: event.durationMs ?? null,
      release: process.env["SENTRY_RELEASE"] ?? null,
      environment: environment(),
      context: sanitizeContext(event.context) as never,
      forwarded,
    });
    return { recorded: true, forwarded, fingerprint };
  } catch {
    return { recorded: false, forwarded: false, fingerprint: "" };
  }
}
