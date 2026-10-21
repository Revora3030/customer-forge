import type { SupabaseClient } from "@supabase/supabase-js";
import { safeArtifactUrl, summarize, type RunEventKind, type RunEventStatus } from "./jarvis-events";

export type RunEventInput = {
  step: number;
  kind: RunEventKind;
  status: RunEventStatus;
  toolId?: string | null;
  label?: string | null;
  startedAt: number;
  finishedAt?: number | null;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  artifactUrl?: unknown;
  provider?: string | null;
  model?: string | null;
};

/**
 * Collects a run's events and saves them in one insert. Best-effort: a failed
 * write is logged and never blocks or changes Jarvis's reply.
 */
export function createRunRecorder(userId: string) {
  const runId = crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  return {
    runId,
    add(event: RunEventInput) {
      const finished = event.finishedAt ?? null;
      rows.push({
        run_id: runId,
        user_id: userId,
        step: event.step,
        kind: event.kind,
        status: event.status,
        tool_id: event.toolId ?? null,
        label: summarize(event.label, 200),
        started_at: new Date(event.startedAt).toISOString(),
        finished_at: finished ? new Date(finished).toISOString() : null,
        duration_ms: finished ? Math.max(0, Math.round(finished - event.startedAt)) : null,
        input_summary: summarize(event.input, 500),
        output_summary: summarize(event.output, 1500),
        error: summarize(event.error, 300),
        artifact_url: safeArtifactUrl(event.artifactUrl),
        provider: event.provider ?? null,
        model: event.model ?? null,
      });
    },
    get count() {
      return rows.length;
    },
    async flush(db: SupabaseClient, messageId: string | null) {
      if (!rows.length) return;
      const { error } = await db.from("jarvis_run_events").insert(rows.map((r) => ({ ...r, message_id: messageId })));
      if (error) console.warn("[jarvis] run events not saved", error.code ?? error.message);
    },
  };
}
