/**
 * One reset for every way a session ends: the Sign out buttons, the Settings
 * sign-out, and a session that ends on its own (refresh token expired or
 * revoked, or signed out in another tab). Without it, a session that expired
 * kept the previous account's cached workspace, leads and settings in memory
 * and its "remember me" choice in storage for whoever used the device next.
 */
import type { QueryClient } from "@tanstack/react-query";

export type SignedOutResetDeps = {
  queryClient: Pick<QueryClient, "cancelQueries" | "clear">;
  /** Ends the "remember me" / per-tab session policy (auth-session.ts). */
  clearSessionPolicy: () => void;
  /** Drops cached builder chat turns (builder-memory.ts), loaded lazily. */
  clearCachedTurns?: () => void | Promise<void>;
};

/**
 * Clears everything the signed-out account left in the page. Safe to call more
 * than once (a manual sign-out runs it, then the SIGNED_OUT event runs it
 * again) and never throws: a failed step must not keep the next step from
 * running or break the sign-out itself.
 */
export async function resetSignedOutState(deps: SignedOutResetDeps): Promise<void> {
  try {
    await deps.queryClient.cancelQueries();
  } catch {
    /* in-flight queries are discarded by clear() below anyway */
  }
  try {
    deps.queryClient.clear();
  } catch {
    /* nothing cached */
  }
  try {
    deps.clearSessionPolicy();
  } catch {
    /* storage unavailable */
  }
  try {
    await deps.clearCachedTurns?.();
  } catch {
    /* blocked storage: nothing cached */
  }
}

/** Lazy loader so public pages don't pull the builder module up front. */
export async function clearBuilderCachedTurns(): Promise<void> {
  const memory = await import("@/lib/builder-memory");
  memory.clearAllCachedTurns();
}
