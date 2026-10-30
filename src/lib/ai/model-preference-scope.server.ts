/**
 * Per-request model preference (the owner's admin model picker).
 * Rides on AsyncLocalStorage like the spend scope, so one builder request's
 * pick never leaks into another workspace's build. The router tries a
 * preferred id first when that id is already on this role's roster or on
 * another chat roster and the live catalogue allows it for this role's
 * surface. Every other model on the role stays as failover. Caps and
 * free-only scopes still win. Image and transcription rosters are never
 * pulled into a chat call.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const scopes = new AsyncLocalStorage<string>();

export function withModelPreference<T>(model: string | null, work: () => T): T {
  return model ? scopes.run(model, work) : work();
}

export function scopedPreferredModels(explicit?: string[]): string[] | undefined {
  const picked = scopes.getStore();
  if (!picked) return explicit;
  return [picked, ...(explicit ?? []).filter(id => id !== picked)];
}
