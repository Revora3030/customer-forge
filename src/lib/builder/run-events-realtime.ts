/**
 * The one place live run steps can switch from polling to Supabase Realtime.
 *
 * Jarvis live steps are written to `jarvis_run_events` (see
 * jarvis-events.server.ts). JC-32 publishes that table into
 * `supabase_realtime` (migration 20261105140000_jarvis_run_events_realtime.sql)
 * and points `RUN_EVENTS_REALTIME` at it. While the channel is not connected,
 * or the publication has not been applied yet, the existing polling keeps the
 * tree live. There is deliberately no public unauthenticated stream; Realtime
 * goes through the signed-in session, so the table's own row-level security
 * (member/owner read) decides who can see a run.
 *
 * PAI-2's agent_runs / agent_run_steps tables stay on polling until a feed
 * writes there and a separate publication lands.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeSource = {
  table: string;
  /** Column holding the run (or request) id this tree is showing. */
  filterColumn: string;
  schema?: string;
};

/** Jarvis run-event feed. Null would force polling-only. */
export const RUN_EVENTS_REALTIME: RealtimeSource | null = {
  table: "jarvis_run_events",
  filterColumn: "run_id",
};

/** How often to poll while a Realtime channel is connected (a safety net, not the live path). */
export const REALTIME_SAFETY_POLL_MS = 15_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z_][a-z0-9_]*$/i;

/** Poll interval to use: the normal one, or the slow safety net while Realtime is connected. */
export const pollInterval = (baseMs: number, realtimeConnected: boolean): number =>
  realtimeConnected ? Math.max(baseMs, REALTIME_SAFETY_POLL_MS) : baseMs;

/**
 * Subscribes to row changes for one run and calls `onChange` for each. Returns
 * `connected`, true only while the channel is really subscribed.
 */
export function useRunEventsRealtime(options: {
  source?: RealtimeSource | null;
  runId: string | null | undefined;
  enabled: boolean;
  onChange: () => void;
}): { connected: boolean } {
  const { source = RUN_EVENTS_REALTIME, runId, enabled, onChange } = options;
  const [connected, setConnected] = useState(false);
  const valid = Boolean(source && enabled && runId && UUID.test(runId) && IDENT.test(source.table) && IDENT.test(source.filterColumn));

  useEffect(() => {
    if (!valid || !source || !runId) {
      setConnected(false);
      return;
    }
    const channel = supabase
      .channel(`run-events-${source.table}-${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: source.schema ?? "public", table: source.table, filter: `${source.filterColumn}=eq.${runId}` },
        () => onChange(),
      )
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));
    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
    // onChange is expected to be stable (a query invalidation); resubscribing on its identity would churn the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, source?.table, source?.filterColumn, source?.schema, runId]);

  return { connected: valid && connected };
}
