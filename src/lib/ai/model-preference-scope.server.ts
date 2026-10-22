/**
 * Per-request model preference (the owner's admin model picker).
 * Rides on AsyncLocalStorage like the spend scope, so one builder request's
 * pick never leaks into another workspace's build. It only reorders: the
 * router puts the picked model first where a role's roster already has it,
 * and every other model stays as failover. Caps and free-only scopes still win.
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
