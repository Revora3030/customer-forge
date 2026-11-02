/**
 * The signed-in owner's bearer token for builder work running outside the
 * owner's own browser request (the background chat worker). Helpers that read
 * the request's Authorization header check this first, so they act as the
 * owner rather than as the worker's scheduler credential.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const acting = new AsyncLocalStorage<string>();

export function withActingAuthorization<T>(authorization: string, work: () => T): T {
  return acting.run(authorization, work);
}

export function actingAuthorization(): string | null {
  return acting.getStore() ?? null;
}
