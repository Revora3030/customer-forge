/**
 * Builder chat work that keeps going when the owner leaves the app.
 *
 * A phone that switches apps drops its open request, and the hosting runtime
 * cancels server work tied to a dropped request — the AI plan (or the apply)
 * died half-way. Each plan/apply is now a row in `builder_chat_jobs`, and the
 * database (pg_net via `call_revora_job`, 15-minute hold) calls the worker
 * route that runs it. The owner's browser only waits for the saved result; if
 * it disappears, the work still finishes and the saved result is picked up on
 * return. If the worker route is unreachable (not yet deployed, outage), the
 * waiting request claims the job itself after a short grace, exactly as before.
 *
 * The worker acts as the owner — never as the service role — by opening a
 * short-lived session for the job's user, so row-level security and every
 * builder permission check still apply.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ChatJobKind = "plan" | "apply";

export type ChatJobRow = {
  id: string;
  organization_id: string;
  user_id: string;
  kind: ChatJobKind;
  request_key: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  input: Record<string, unknown>;
  result: unknown;
  error: string | null;
  attempts: number;
  fence: number;
  created_at: string;
};

/** Runs one job as its owner. Supplied by the builder (site-agent.functions). */
export type ChatJobExecutor = (job: ChatJobRow, owner: { supabase: SupabaseClient<Database>; authorization: string }) => Promise<unknown>;

export const CHAT_JOB_WORKER_TIMEOUT_MS = 900_000;
/** How long a waiting request lets the background worker pick the job up before running it itself. */
export const INLINE_FALLBACK_AFTER_MS = 20_000;
/** A finished job is reused for the same request key only while this fresh (matches apply idempotency). */
export const REUSE_DONE_FOR_MS = 15 * 60 * 1000;
const LEASE_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = SupabaseClient<Database>;
// The generated types know this table, but the queries below stay loosely typed
// so the module does not depend on regeneration order.
type Loose = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export function chatJobWorkerPath(jobId: string): string {
  if (!UUID.test(jobId)) throw new Error("Invalid job");
  return `builder-chat?job=${jobId.toLowerCase()}`;
}

/** What to do with an existing row under the same request key. */
export function reuseDecision(row: Pick<ChatJobRow, "status" | "created_at">, now = Date.now()): "wait" | "reuse" | "requeue" {
  if (row.status === "queued" || row.status === "running") return "wait";
  const age = now - Date.parse(row.created_at);
  if (row.status === "done" && Number.isFinite(age) && age < REUSE_DONE_FOR_MS) return "reuse";
  return "requeue";
}

/** Creates (or finds) the job for this request key and asks the database to run it. */
export async function startChatJob(input: {
  organizationId: string;
  userId: string;
  kind: ChatJobKind;
  requestKey: string;
  payload: Record<string, unknown>;
}): Promise<ChatJobRow> {
  const db = await admin();
  const insert = await db
    .from("builder_chat_jobs")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      kind: input.kind,
      request_key: input.requestKey,
      input: input.payload,
    })
    .select("*")
    .single();
  let row = insert.data as ChatJobRow | null;
  if (insert.error) {
    if (insert.error.code !== "23505") throw new Error(insert.error.message);
    const existing = await db
      .from("builder_chat_jobs")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("kind", input.kind)
      .eq("request_key", input.requestKey)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error(existing.error?.message ?? "Couldn't read the saved request.");
    row = existing.data as ChatJobRow;
    // Another person's job under the same key is never handed back.
    if (row.user_id !== input.userId) throw new Error("This request belongs to someone else.");
    const decision = reuseDecision(row);
    if (decision !== "requeue") return row;
    const reset = await db
      .from("builder_chat_jobs")
      .update({ status: "queued", input: input.payload, result: null, error: null, attempts: 0, lease_expires_at: null, finished_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("fence", row.fence)
      .select("*")
      .maybeSingle();
    row = (reset.data as ChatJobRow | null) ?? row;
  }
  if (!row) throw new Error("Couldn't save the request.");
  await kickChatJob(row.id);
  return row;
}

/** Ask the database to call the worker. Never throws: the waiting request is the fallback. */
export async function kickChatJob(jobId: string): Promise<boolean> {
  try {
    const db = await admin();
    const { error } = await db.rpc("call_revora_job", { path: chatJobWorkerPath(jobId), timeout_ms: CHAT_JOB_WORKER_TIMEOUT_MS });
    if (error) console.warn("[builder-chat] background run request failed", error.message);
    return !error;
  } catch (error) {
    console.warn("[builder-chat] background run request failed", error);
    return false;
  }
}

export async function readChatJob(jobId: string): Promise<ChatJobRow | null> {
  const db = await admin();
  const { data } = await db.from("builder_chat_jobs").select("*").eq("id", jobId).maybeSingle();
  return (data as ChatJobRow | null) ?? null;
}

async function claim(jobId: string, worker: string): Promise<ChatJobRow | null> {
  const db = await admin();
  const { data, error } = await db.rpc("builder_chat_job_claim", { _id: jobId, _worker: worker, _lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as ChatJobRow[];
  return rows[0] ?? null;
}

async function settle(job: ChatJobRow, patch: Record<string, unknown>): Promise<void> {
  const db = await admin();
  await db
    .from("builder_chat_jobs")
    .update({ ...patch, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), lease_expires_at: null })
    .eq("id", job.id)
    .eq("fence", job.fence)
    .eq("status", "running");
}

/** Hand a claimed job back to the queue (for example: the owner session could not be opened here). */
async function release(job: ChatJobRow): Promise<void> {
  const db = await admin();
  await db
    .from("builder_chat_jobs")
    .update({ status: "queued", attempts: Math.max(0, job.attempts - 1), lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("fence", job.fence)
    .eq("status", "running");
}

export async function cancelChatJob(organizationId: string, userId: string, kind: ChatJobKind, requestKey: string): Promise<void> {
  const db = await admin();
  await db
    .from("builder_chat_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("request_key", requestKey)
    .in("status", ["queued", "running"]);
}

export async function isChatJobCancelled(jobId: string): Promise<boolean> {
  return (await readChatJob(jobId))?.status === "cancelled";
}

/** Runs a claimed job with a lease heartbeat and saves its outcome. */
async function runClaimed(job: ChatJobRow, owner: { supabase: SupabaseClient<Database>; authorization: string }, execute: ChatJobExecutor): Promise<ChatJobRow> {
  const db = await admin();
  const beat = setInterval(() => {
    void db
      .from("builder_chat_jobs")
      .update({ lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("fence", job.fence)
      .eq("status", "running")
      .then(() => undefined, () => undefined);
  }, 30_000);
  try {
    const result = await execute(job, owner);
    await settle(job, { status: "done", result: (result ?? null) as never, error: null });
    return { ...job, status: "done", result };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000) || "That request couldn't be finished.";
    await settle(job, { status: "failed", error: message });
    return { ...job, status: "failed", error: message };
  } finally {
    clearInterval(beat);
  }
}

function publishableFetch(key: string): typeof fetch {
  return (resource, init) => {
    const headers = new Headers(init?.headers);
    if ((key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(resource, { ...init, headers });
  };
}

/**
 * Opens a short-lived session for the job's owner (no email is sent) so the
 * work runs under their permissions. The session is signed out afterwards.
 */
export async function openOwnerSession(userId: string): Promise<{ supabase: SupabaseClient<Database>; authorization: string; close: () => Promise<void> }> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Authentication unavailable.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminAuth = (supabaseAdmin as Admin).auth.admin;
  const { data: user, error: userError } = await adminAuth.getUserById(userId);
  const email = user?.user?.email;
  if (userError || !email) throw new Error("Owner account unavailable.");
  const { data: link, error: linkError } = await adminAuth.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error("Owner session unavailable.");
  const client = createClient<Database>(url, key, {
    global: { fetch: publishableFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const session = verified?.session;
  if (verifyError || !session || session.user.id !== userId) throw new Error("Owner session unavailable.");
  return {
    supabase: client,
    authorization: `Bearer ${session.access_token}`,
    close: async () => {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    },
  };
}

/** Worker entry: claim, run as the owner, save. Releases the job if the owner session can't be opened. */
export async function runChatJobInBackground(jobId: string, execute: ChatJobExecutor): Promise<{ status: string }> {
  const job = await claim(jobId, "worker");
  if (!job) return { status: "not_claimed" };
  let owner: Awaited<ReturnType<typeof openOwnerSession>>;
  try {
    owner = await openOwnerSession(job.user_id);
  } catch (error) {
    console.warn("[builder-chat] owner session unavailable; leaving the job for the waiting request", error);
    await release(job);
    return { status: "released" };
  }
  try {
    const done = await runClaimed(job, owner, execute);
    return { status: done.status };
  } finally {
    await owner.close();
  }
}

/**
 * Called by the owner's own request: waits for the background run, and runs
 * the job itself (with the caller's own session) if nobody picked it up.
 */
export async function awaitChatJob(
  job: ChatJobRow,
  inline: { supabase: SupabaseClient<Database>; authorization: string },
  execute: ChatJobExecutor,
  options: { fallbackAfterMs?: number; maxWaitMs?: number; pollMs?: number } = {},
): Promise<unknown> {
  const fallbackAfter = options.fallbackAfterMs ?? INLINE_FALLBACK_AFTER_MS;
  const deadline = Date.now() + (options.maxWaitMs ?? 14 * 60 * 1000);
  const started = Date.now();
  let current: ChatJobRow | null = job;
  while (current) {
    if (current.status === "done") return current.result;
    if (current.status === "failed") throw new Error(current.error || "That request couldn't be finished.");
    if (current.status === "cancelled") throw new Error("That request was stopped.");
    if (current.status === "queued" && Date.now() - started >= fallbackAfter) {
      const claimed = await claim(current.id, "inline");
      if (claimed) {
        const done = await runClaimed(claimed, inline, execute);
        if (done.status === "done") return done.result;
        throw new Error(done.error || "That request couldn't be finished.");
      }
    }
    if (Date.now() > deadline)
      // Matches the browser's dropped-connection check, so it keeps waiting
      // for the saved result instead of failing the request.
      throw new Error("The connection timed out while Revora kept working.");
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 2000));
    current = await readChatJob(current.id);
  }
  throw new Error("That request couldn't be found.");
}
