import { reportClientError } from "@/lib/monitoring.functions";

type RouteErrorContext = {
  boundary?: string;
  componentStack?: string;
  mechanism?: string;
};

const recentReports = new Map<string, number>();
const DEDUPE_MS = 10_000;

function details(error: unknown) {
  if (typeof Response !== "undefined" && error instanceof Response) {
    return {
      message: `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`,
      stack: "",
    };
  }
  if (error instanceof Error) {
    return { message: error.message || error.name || "Unknown error", stack: error.stack ?? "" };
  }
  return { message: String(error || "Unknown error"), stack: "" };
}

function route() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

export function reportRouteError(error: unknown, context: RouteErrorContext = {}) {
  const { message, stack } = details(error);
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
  };
  if (context.componentStack) data.componentStack = context.componentStack.slice(0, 4000);
  void reportClientError({ data }).catch(() => undefined);
}
