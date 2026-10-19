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

export type AiSpendScope = { freeOnly: boolean; reason: string | null };

const scopes = new AsyncLocalStorage<AiSpendScope>();

/** Runs `work` inside a spending scope. A free-only outer scope always wins. */
export function withAiSpendScope<T>(scope: AiSpendScope, work: () => T): T {
  const outer = scopes.getStore();
  const next: AiSpendScope = outer?.freeOnly ? outer : scope;
  return scopes.run(next, work);
}

/** True when the current call is inside a free-only scope. */
export function scopedFreeOnly(): boolean {
  return scopes.getStore()?.freeOnly === true;
}

/** Why the current scope is free-only (for logs and telemetry), or null. */
export function scopedFreeOnlyReason(): string | null {
  const scope = scopes.getStore();
  return scope?.freeOnly ? scope.reason : null;
}

/**
 * Demo (is_demo) workspace builds use only the free pool unless the owner
 * opts out with DEMO_BUILDS_ALLOW_PAID=true.
 */
export function demoBuildsAllowPaid(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return ["true", "1", "yes", "on"].includes((environment["DEMO_BUILDS_ALLOW_PAID"] ?? "").trim().toLowerCase());
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
 * The spending scope for one workspace's build. Demo workspaces are free-only
 * by default. If the workspace can't be read the build is free-only too: the
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
