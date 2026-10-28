/**
 * Per-run AI spending scope.
 *
 * One worker process can run builds for several workspaces at once, so a
 * module-level "free only" switch would leak between them. The scope rides on
 * AsyncLocalStorage instead (already used by background.ts, so the runtime has
 * node:async_hooks): every AI call awaited inside `withAiSpendScope` sees the
 * scope of the build that started it, and only that build.
 *
 * A scope can only narrow spending: a free-only scope cannot be widened by a
 * nested call. The paid gates read `scopedFreeOnly()`:
 * - router.server buildChain leaves paid providers out of the chain,
 * - hall-of-fame.server skips the paid collective,
 * - paid-image.server reports the premium picture lane as off,
 * - paid-budget.server reservePaidSpend refuses every reservation (the
 *   fail-closed backstop that also covers Luna, paid images and video).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type AiSpendScope = {
  freeOnly: boolean;
  reason: string | null;
  /**
   * Aborted when the build that owns this scope is cancelled or loses its
   * lease. Every AI call awaited inside the scope stops with it: a stopped
   * build must stop spending now, not at the next stage boundary a few minutes
   * (and a few dozen paid calls) later.
   */
  signal?: AbortSignal | undefined;
};

const scopes = new AsyncLocalStorage<AiSpendScope>();

/** Runs `work` inside a spending scope. A free-only outer scope always wins. */
export function withAiSpendScope<T>(scope: AiSpendScope, work: () => T): T {
  const outer = scopes.getStore();
  // A nested scope can narrow spending but never drops the build's stop signal.
  const signal = scope.signal ?? outer?.signal;
  const next: AiSpendScope = outer?.freeOnly ? outer : { ...scope, signal };
  return scopes.run(next, work);
}

/** True when the current call is inside a free-only scope. */
export function scopedFreeOnly(): boolean {
  return scopes.getStore()?.freeOnly === true;
}

/** The cancel signal of the build this call belongs to, or null outside a build. */
export function scopedAbortSignal(): AbortSignal | null {
  return scopes.getStore()?.signal ?? null;
}

/** True when the build this call belongs to has been stopped. */
export function scopedBuildStopped(): boolean {
  return scopedAbortSignal()?.aborted === true;
}

/** Why the current scope is free-only (for logs and telemetry), or null. */
export function scopedFreeOnlyReason(): string | null {
  const scope = scopes.getStore();
  return scope?.freeOnly ? scope.reason : null;
}

/**
 * Demo builds share the paid/free team by default, within existing caps.
 * An explicit false or invalid operator value keeps demos free-only.
 */
export function demoBuildsAllowPaid(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const declared = environment["DEMO_BUILDS_ALLOW_PAID"]?.trim().toLowerCase();
  return !declared || ["true", "1", "yes", "on"].includes(declared);
}

type OrgReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/**
 * The spending scope for one workspace's build. Demo workspaces use both lanes
 * unless explicitly restricted. If the workspace can't be read the build is free-only: the
 * spending side fails closed, like the daily paid cap.
 */
export async function buildSpendScope(db: OrgReader, organizationId: string): Promise<AiSpendScope> {
  try {
    const { data, error } = await db.from("organizations").select("is_demo").eq("id", organizationId).maybeSingle();
    if (error || !data) return { freeOnly: true, reason: "workspace_unreadable" };
    const isDemo = (data as { is_demo?: unknown }).is_demo === true;
    if (isDemo && !demoBuildsAllowPaid()) return { freeOnly: true, reason: "demo_workspace" };
    return { freeOnly: false, reason: null };
  } catch {
    return { freeOnly: true, reason: "workspace_unreadable" };
  }
}
