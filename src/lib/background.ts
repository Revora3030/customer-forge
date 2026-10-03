/**
 * Background work that must outlive the HTTP response.
 *
 * On Cloudflare Workers, a promise left running after the response is sent is
 * cancelled unless it is registered with `ctx.waitUntil`. The build kick used
 * to be a bare `void promise`, so the worker could be cut off and a queued
 * build waited until the owner's browser nudged it.
 */
type WaitUntil = (promise: Promise<unknown>) => void;

let current: WaitUntil | null = null;

/** Called by the server entry for each request with the platform context. */
export function bindExecutionContext(ctx: unknown): void {
  const candidate = ctx as { waitUntil?: WaitUntil } | null | undefined;
  current = typeof candidate?.waitUntil === "function" ? candidate.waitUntil.bind(candidate) : null;
}

/** Runs `work` in the background, kept alive past the response when possible. */
export function runInBackground(work: () => Promise<unknown>): void {
  const promise = work().catch((error) => {
    console.error("[background] task failed", error);
  });
  try {
    current?.(promise);
  } catch {
    // Not inside a request context; the promise still runs best-effort.
  }
}
