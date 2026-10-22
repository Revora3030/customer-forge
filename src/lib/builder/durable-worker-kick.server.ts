/**
 * Asks the database to call the site-engine worker for one workspace.
 * `call_revora_job` (security definer, service role only) posts to the worker
 * route via pg_net with a 15-minute timeout, so the build is held open by the
 * database rather than by a browser tab or a short background grace period.
 * The worker's lease keeps repeated requests single-flight.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DURABLE_WORKER_TIMEOUT_MS = 900_000;

export function durableWorkerPath(organizationId: string): string {
  if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
  return `site-engine?organizationId=${organizationId.toLowerCase()}`;
}

export async function requestDurableWorkerRun(organizationId: string): Promise<boolean> {
  const path = durableWorkerPath(organizationId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  }).rpc("call_revora_job", { path, timeout_ms: DURABLE_WORKER_TIMEOUT_MS });
  if (error) {
    console.warn("[site-engine] durable worker request failed", error.message);
    return false;
  }
  return true;
}
