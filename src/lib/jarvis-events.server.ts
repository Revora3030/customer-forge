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
export function createRunRecorder(userId: string, live?: { db: SupabaseClient; runId?: string | null }) {
  const runId = live?.runId && /^[0-9a-f-]{36}$/i.test(live.runId) ? live.runId : crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  // Live mode: each step is written as it finishes so the owner can watch progress.
  let written = 0;
  let chain: Promise<void> = Promise.resolve();
  const writeNext = () => {
    if (!live) return;
    const batch = rows.slice(written);
    written = rows.length;
    if (!batch.length) return;
    chain = chain.then(async () => {
      const { error } = await live.db.from("jarvis_run_events").insert(batch.map((r) => ({ ...r, message_id: null })));
      if (error) console.warn("[jarvis] live run event not saved", error.code ?? error.message);
    });
  };
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
      writeNext();
    },
    get count() {
      return rows.length;
    },
    async flush(db: SupabaseClient, messageId: string | null) {
      if (!rows.length) return;
      if (live) {
        writeNext();
        await chain;
        const { error } = await db.from("jarvis_run_events").update({ message_id: messageId }).eq("run_id", runId).eq("user_id", userId);
        if (error) console.warn("[jarvis] run events not linked", error.code ?? error.message);
        return;
      }
      const { error } = await db.from("jarvis_run_events").insert(rows.map((r) => ({ ...r, message_id: messageId })));
      if (error) console.warn("[jarvis] run events not saved", error.code ?? error.message);
    },
  };
}
