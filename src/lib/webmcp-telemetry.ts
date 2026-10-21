// Static names and durations must satisfy the collector's lovable.webmcp_tool_invoked bounds.
const MAX_DURATION_MS = 86_400_000;

function track(toolName: string, outcome: "ok" | "error", durationMs: number) {
  try {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(toolName)) return;
    const runtime = (
      window as Window & {
        __lovableEvents?: { track?: (event: string, properties?: Record<string, unknown>) => string | null };
      }
    ).__lovableEvents;
    runtime?.track?.("lovable.webmcp_tool_invoked", {
      tool_name: toolName,
      outcome,
      duration_ms: durationMs,
    });
  } catch {
    // Telemetry must not change the tool's result or error.
  }
}

export async function runWebMCPTool<T>(staticToolName: string, operation: () => T | Promise<T>): Promise<T> {
  let started: number | undefined;
  try {
    started = performance.now();
  } catch {
    // An unavailable clock leaves duration at zero.
  }
  let outcome: "ok" | "error" = "error";
  try {
    const result = await operation();
    outcome = "ok";
    return result;
  } finally {
    let durationMs = 0;
    if (started !== undefined) {
      try {
        const elapsed = performance.now() - started;
        if (Number.isFinite(elapsed)) durationMs = Math.min(MAX_DURATION_MS, Math.max(0, elapsed));
      } catch {
        // An unavailable clock leaves duration at zero.
      }
    }
    track(staticToolName, outcome, durationMs);
  }
}
