/**
 * Records BRF-03 ops spans: one structured log line always, OTLP export only
 * when a collector is configured. Never throws and never delays the caller.
 */
import { runInBackground } from "@/lib/background.server";
import { buildOpsSpanPayload, errorTypeOf, opsLogRecord, type OpsAttributes, type OpsOutcome, type OpsSpan, type OpsSpanName } from "./ops-trace";

export function recordOpsSpan(span: OpsSpan): void {
  try {
    const line = `[revora-trace] ${JSON.stringify(opsLogRecord(span))}`;
    if (span.outcome === "failed") console.warn(line);
    else console.info(line);
    runInBackground(async () => {
      const { exportOtlpBody } = await import("@/lib/ai/observability-export.server");
      await exportOtlpBody(JSON.stringify(buildOpsSpanPayload(span, process.env["NODE_ENV"] ?? "unknown")));
    });
  } catch {
    // Tracing must never break a build or a publish.
  }
}

/**
 * Runs `work` inside a span. `judge` turns a returned value into an outcome
 * (e.g. a publish that a gate refused is "blocked"); a throw is "failed" and is
 * rethrown unchanged.
 */
export async function traceOps<T>(
  name: OpsSpanName,
  work: () => Promise<T>,
  judge: (result: T) => { outcome: OpsOutcome; attributes?: OpsAttributes } = () => ({ outcome: "ok" }),
  options: { traceKey?: string; attributes?: OpsAttributes } = {},
): Promise<T> {
  const startedAtMs = Date.now();
  const traceKey = options.traceKey ?? crypto.randomUUID();
  try {
    const result = await work();
    let verdict: { outcome: OpsOutcome; attributes?: OpsAttributes } = { outcome: "ok" };
    try {
      verdict = judge(result);
    } catch {
      // keep "ok": the work itself succeeded
    }
    recordOpsSpan({ name, traceKey, startedAtMs, endedAtMs: Date.now(), outcome: verdict.outcome, attributes: { ...options.attributes, ...verdict.attributes } });
    return result;
  } catch (error) {
    recordOpsSpan({ name, traceKey, startedAtMs, endedAtMs: Date.now(), outcome: "failed", errorType: errorTypeOf(error), ...(options.attributes ? { attributes: options.attributes } : {}) });
    throw error;
  }
}
