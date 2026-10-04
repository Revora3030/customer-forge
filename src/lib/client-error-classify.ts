/**
 * Turns whatever a browser handed us (an Error, a rejected non-Error value, an
 * ErrorEvent, a Response...) into a reportable shape, and decides whether it is
 * worth reporting at all.
 *
 * Several active production issues were not application crashes but noise:
 *  - router control flow (redirect()/notFound()) surfacing as "undefined" or
 *    "[object Object]" when it escaped to a global listener,
 *  - cross-origin "Script error." events from third-party tags, which carry no
 *    message, stack or file and cannot be acted on,
 *  - React 19 recoverable errors (hydration mismatch, "React was able to
 *    recover") that React already handled by re-rendering on the client.
 * Pure and side-effect free so it can be unit tested.
 */

export type ClientErrorDisposition = "report" | "warn" | "ignore";

export type DescribedClientError = {
  message: string;
  stack: string;
  /** What the thrown value actually was, so non-Error throws are visible in Sentry. */
  kind: string;
};

const MAX_MESSAGE = 500;

function isRouterControlFlow(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as { isNotFound?: unknown; isRedirect?: unknown; options?: unknown };
  if (v.isNotFound === true) return true;
  // TanStack redirects are Response objects carrying router options.
  if (typeof Response !== "undefined" && value instanceof Response) {
    return Boolean((value as Response & { options?: unknown }).options);
  }
  return v.isRedirect === true;
}

export function describeClientError(error: unknown): DescribedClientError {
  if (typeof Response !== "undefined" && error instanceof Response) {
    return {
      message: `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`,
      stack: "",
      kind: "Response",
    };
  }
  if (error instanceof Error) {
    const message = error.message || error.name || "Error without a message";
    return { message: message.slice(0, MAX_MESSAGE), stack: error.stack ?? "", kind: error.name || "Error" };
  }
  if (error === undefined || error === null) {
    // `throw undefined` / `Promise.reject()` — keep it identifiable instead of
    // the literal string "undefined" that grouped unrelated failures together.
    return {
      message: `Non-Error value thrown or rejected: ${String(error)}`,
      stack: "",
      kind: String(error),
    };
  }
  if (typeof error === "string") {
    return { message: (error.trim() || "Empty error string").slice(0, MAX_MESSAGE), stack: "", kind: "string" };
  }
  if (typeof error === "object") {
    const v = error as {
      message?: unknown;
      error_description?: unknown;
      error?: unknown;
      code?: unknown;
      status?: unknown;
      stack?: unknown;
    };
    const text =
      (typeof v.message === "string" && v.message) ||
      (typeof v.error_description === "string" && v.error_description) ||
      (typeof v.error === "string" && v.error) ||
      "";
    const code = typeof v.code === "string" || typeof v.code === "number" ? ` (code ${v.code})` : "";
    const status = typeof v.status === "number" ? ` (status ${v.status})` : "";
    let shape = "";
    if (!text) {
      try {
        shape = JSON.stringify(error)?.slice(0, 200) ?? "";
      } catch {
        shape = "";
      }
    }
    return {
      message: (text ? `${text}${code}${status}` : `Non-Error object thrown: ${shape || "{}"}${code}${status}`).slice(
        0,
        MAX_MESSAGE,
      ),
      stack: typeof v.stack === "string" ? v.stack : "",
      kind: (error as object).constructor?.name || "object",
    };
  }
  return { message: `Non-Error value thrown: ${String(error)}`.slice(0, MAX_MESSAGE), stack: "", kind: typeof error };
}

const RECOVERABLE_REACT = [
  /hydration failed because the (server rendered|initial ui)/i,
  /error during concurrent rendering but react was able to recover/i,
  /there was an error while hydrating/i,
  /text content does not match server-rendered html/i,
  /minified react error #(418|419|421|422|423|425)\b/i,
];

export function classifyClientError(error: unknown, described = describeClientError(error)): ClientErrorDisposition {
  if (isRouterControlFlow(error)) return "ignore";
  const message = described.message.trim();
  // Cross-origin script failures: the browser hides every detail, so there is
  // nothing to fix and nothing to group on.
  if (/^script error\.?$/i.test(message) && !described.stack) return "ignore";
  // Browser-extension / ResizeObserver noise that is not caused by the app.
  if (/^ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(message)) return "ignore";
  if (RECOVERABLE_REACT.some((pattern) => pattern.test(message))) return "warn";
  return "report";
}

/** Shape a window `error` event so a missing `event.error` still keeps its location. */
export function errorFromWindowEvent(event: {
  error?: unknown;
  message?: unknown;
  filename?: unknown;
  lineno?: unknown;
  colno?: unknown;
}): unknown {
  if (event.error !== undefined && event.error !== null) return event.error;
  const message = typeof event.message === "string" ? event.message : "";
  const file = typeof event.filename === "string" ? event.filename : "";
  if (!file) return message || undefined;
  const line = typeof event.lineno === "number" ? event.lineno : 0;
  const col = typeof event.colno === "number" ? event.colno : 0;
  const synthetic = new Error(message || "Window error without details");
  synthetic.stack = `${synthetic.name}: ${synthetic.message}\n    at ${file}:${line}:${col}`;
  return synthetic;
}

/** Safe JSON parse for client storage/cookies: never throws, always returns a value. */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
