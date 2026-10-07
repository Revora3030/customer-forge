import { reportClientError } from "@/lib/monitoring.functions";
import { classifyClientError, describeClientError } from "@/lib/client-error-classify";

type RouteErrorContext = {
  boundary?: string;
  componentStack?: string;
  mechanism?: string;
};

const recentReports = new Map<string, number>();
const DEDUPE_MS = 10_000;

/**
 * The route WITHOUT secrets: share-preview and invite paths carry a bearer
 * token as a path segment, and must never reach the error store or Sentry.
 */
export function safeRoutePath(pathname: string): string {
  return pathname.replace(/^\/(p|invite|preview|unsubscribe)\/[^/]+/, "/$1/[token]");
}

function route() {
  return typeof window === "undefined" ? "" : safeRoutePath(window.location.pathname);
}

export function reportRouteError(error: unknown, context: RouteErrorContext = {}) {
  const described = describeClientError(error);
  // Router redirects/notFound, cross-origin "Script error." and similar noise
  // carry nothing actionable; React-recovered hydration errors are warnings.
  const disposition = classifyClientError(error, described);
  if (disposition === "ignore") return;
  const { message, stack } = described;
  const key = `${route()}|${message.slice(0, 180)}|${stack.split("\n")[0] ?? ""}`;
  const now = Date.now();
  const previous = recentReports.get(key);
  if (previous && now - previous < DEDUPE_MS) return;
  recentReports.set(key, now);

  if (recentReports.size > 100) {
    for (const [entry, timestamp] of recentReports) {
      if (now - timestamp >= DEDUPE_MS) recentReports.delete(entry);
    }
  }

  const data: Parameters<typeof reportClientError>[0]["data"] = {
    message,
    stack,
    route: route(),
    mechanism: context.mechanism ?? "tanstack_route",
    kind: described.kind,
    level: disposition === "warn" ? "warning" : "error",
  };
  if (context.componentStack) data.componentStack = context.componentStack.slice(0, 4000);
  void reportClientError({ data }).catch(() => undefined);
}
