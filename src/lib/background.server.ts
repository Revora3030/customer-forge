/**
 * Background work that must outlive the HTTP response.
 *
 * On Cloudflare Workers, a promise left running after the response is sent is
 * cancelled unless it is registered with `ctx.waitUntil`. This only provides
 * a short grace period, not durable execution for a multi-minute build.
 * The build kick used
 * to be a bare `void promise`, so the worker could be cut off and a queued
 * build waited until the owner's browser nudged it.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type WaitUntil = (promise: Promise<unknown>) => void;
const executionContext = new AsyncLocalStorage<WaitUntil | null>();

/** Keep concurrent requests from registering work on each other's context. */
export function withExecutionContext<T>(ctx: unknown, work: () => T): T {
  const candidate = ctx as { waitUntil?: WaitUntil } | null | undefined;
  const waitUntil = typeof candidate?.waitUntil === "function" ? candidate.waitUntil.bind(candidate) : null;
  return executionContext.run(waitUntil, work);
}

/** Runs `work` in the background, kept alive past the response when possible. */
export function runInBackground(work: () => Promise<unknown>): void {
  const promise = Promise.resolve().then(work).catch((error) => {
    console.error("[background] task failed", error);
  });
  try {
    executionContext.getStore()?.(promise);
  } catch {
    // Not inside a request context; the promise still runs best-effort.
  }
}
